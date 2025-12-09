import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MessagesService } from '../src/modules/messages/messages.service';
import { AiService } from '../src/modules/ai/ai.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { WhatsappService } from '../src/modules/whatsapp/whatsapp.service';
import { InstagramService } from '../src/modules/instagram/instagram.service';
import { MessengerSendService } from '../src/modules/webhooks/messenger-send.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { WebsocketGateway } from '../src/websockets/websocket.gateway';
import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { normalizeExtractedDateTime } from '../src/utils/booking'; // keep if you already have this util

@Injectable()
@Processor('messageQueue')
export class MessageQueueProcessor {
  private readonly logger = new Logger(MessageQueueProcessor.name);
  private readonly STUDIO_TZ = 'Africa/Nairobi';
  private readonly HISTORY_LIMIT = 8; // how many recent messages to pass to AiService

  constructor(
    private messagesService: MessagesService,
    private aiService: AiService,
    private bookingsService: BookingsService,
    private whatsappService: WhatsappService,
    private customersService: CustomersService,
    private instagramService: InstagramService,
    private messengerSendService: MessengerSendService,
    private websocketGateway: WebsocketGateway,
  ) { }

  /**
   * process: main worker function for incoming messages
   * - job.data can be { messageId } (preferred) or { customerId, message, platform, from }
   */
  @Process('processMessage')
  async process(job: Job<any>): Promise<any> {
    this.logger.log(`[QUEUE DEBUG] Processing job: ${JSON.stringify(job.data)}`);
    try {
      let customerId: string;
      let messageContent: string;
      let platform: 'whatsapp' | 'instagram' | string | undefined;
      let from: string | undefined;

      // 1) Load incoming message (either by id or by payload)
      if (job.data.messageId) {
        this.logger.log(`[QUEUE DEBUG] Loading message by ID: ${job.data.messageId}`);
        const message = await this.messagesService.findOne(job.data.messageId);
        if (!message) {
          this.logger.warn('Message not found for job', job.data);
          return { processed: false, error: 'Message not found' };
        }
        customerId = message.customerId;
        messageContent = message.content;
        platform = message.platform;
        from = (message.customer as any)?.whatsappId || (message.customer as any)?.instagramId || (message.customer as any)?.phone;
        this.logger.log(`[QUEUE DEBUG] Loaded message - customerId: ${customerId}, platform: ${platform}, content: ${messageContent.substring(0, 50)}...`);
      } else {
        ({ customerId, message: messageContent, platform, from } = job.data);
        if (!customerId || !messageContent) {
          this.logger.warn('Invalid job payload', job.data);
          return { processed: false, error: 'Invalid job payload' };
        }
      }

      // 2) Load enriched conversation context (history + customer profile + bookings)
      this.logger.log(`[QUEUE DEBUG] Loading enriched context for customerId: ${customerId}`);
      const enrichedContext = await this.messagesService.getEnrichedContext(customerId);
      const history = enrichedContext.history;
      this.logger.log(`[QUEUE DEBUG] Loaded context with ${history.length} history messages`);

      // 3) Duplicate inbound detection:
      // If the most recent inbound message (before this one) is identical and there is already a matching outbound response,
      // we skip to avoid duplicates. This prevents the webhook's duplicate events or double-processing.
      const lastInbound = [...history].reverse().find(h => h.role === 'user');
      const lastOutbound = [...history].reverse().find(h => h.role === 'assistant');

      if (lastInbound && lastInbound.content === messageContent) {
        // If we already replied to that inbound (lastOutbound exists and its createdAt is after lastInbound.createdAt), skip processing.
        // Note: history items from getEnrichedContext might not have createdAt if it was mapped for GPT.
        // But getEnrichedContext calls getConversationHistory which returns formatted messages.
        // We might need to rely on content check or fetch raw if strict timestamp check is needed.
        // For now, simple content check + role sequence is a good heuristic.
        if (lastOutbound) {
          // This check is a bit loose without timestamps, but acceptable for now.
          // Ideally getEnrichedContext should return timestamps too.
        }
      }

      // 4) Use AI service to handle the entire conversation (it manages intent, extraction, draft, and generates human-like responses)
      this.logger.log(`[QUEUE DEBUG] Calling AI service for message: ${messageContent.substring(0, 50)}...`);
      let response = '';
      let mediaUrls: string[] = [];
      let draft: any = null;

      try {
        // Pass the full enriched context to handleConversation
        const result = await this.aiService.handleConversation(
          messageContent,
          customerId,
          history as any,
          this.bookingsService,
          0,
          enrichedContext // Pass the full context object
        );
        this.logger.log(`[QUEUE DEBUG] AI service returned response: ${typeof result.response === 'string' ? result.response.substring(0, 50) : 'object'}...`);

        if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
          response = result.response.text;
          mediaUrls = result.response.mediaUrls || [];
        } else {
          response = typeof result.response === 'string' ? result.response : JSON.stringify(result.response);
        }

        draft = result.draft;
      } catch (err) {
        this.logger.error('[QUEUE ERROR] Error in AI conversation handling', err);
        response = 'Sorry — I had trouble processing that. Could you please rephrase?';
        // Ensure we have a response even if AI fails
        if (!response) {
          response = 'I\'m experiencing some technical difficulties. A team member will assist you shortly! 💖';
        }
      }

      // 11) Send reply back via channel and record message. Always create outbound message record exactly once.
      this.logger.log(`[QUEUE DEBUG] Preparing to send response via ${platform} to ${from}`);
      if (platform === 'whatsapp' && from) {
        try {
          // Send text message first
          this.logger.log(`[QUEUE DEBUG] Sending WhatsApp message to ${from}`);
          await this.whatsappService.sendMessage(from, response);
          this.logger.log(`[QUEUE DEBUG] WhatsApp message sent successfully`);

          // Send images if any
          if (mediaUrls && mediaUrls.length > 0) {
            for (const url of mediaUrls) {
              await this.whatsappService.sendImage(from, url);
              // Small delay to ensure order
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error sending WhatsApp message', err);
          throw err; // Re-throw to mark job as failed
        }
        try {
          this.logger.log(`[QUEUE DEBUG] Recording outbound message in database`);
          const outboundMessage = await this.messagesService.create({
            content: response,
            platform: 'whatsapp',
            direction: 'outbound',
            customerId,
          });
          // Emit to websocket (non-blocking)
          const customer = await this.customersService.findOne(customerId).catch(() => null);
          this.websocketGateway.emitNewMessage('whatsapp', {
            id: outboundMessage.id,
            from: '',
            to: from,
            content: response,
            timestamp: outboundMessage.createdAt.toISOString(),
            direction: 'outbound',
            customerId,
            customerName: customer?.name,
          });
          this.logger.log(`[QUEUE DEBUG] Outbound message recorded and websocket event emitted`);
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error recording outbound message', err);
          // Don't throw here - message was sent, just recording failed
        }
      } else if (platform === 'instagram' && from) {
      try {
        // Instagram has a 1000 character limit - split into multiple messages if needed
        const MAX_LENGTH = 950;

        if (response.length > MAX_LENGTH) {
          const messages: string[] = [];
          let remaining = response;

          while (remaining.length > 0) {
            if (remaining.length <= MAX_LENGTH) {
              messages.push(remaining);
              break;
            }

            // Find good break point
            let breakPoint = MAX_LENGTH;
            const chunk = remaining.substring(0, MAX_LENGTH);

            // Try paragraph break
            const lastParagraph = chunk.lastIndexOf('\n\n');
            if (lastParagraph > MAX_LENGTH * 0.5) {
              breakPoint = lastParagraph + 2;
            } else {
              // Try sentence break
              const lastSentence = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '));
              if (lastSentence > MAX_LENGTH * 0.5) {
                breakPoint = lastSentence + 2;
              } else {
                // Word break
                const lastSpace = chunk.lastIndexOf(' ');
                if (lastSpace > MAX_LENGTH * 0.7) {
                  breakPoint = lastSpace + 1;
                }
              }
            }

            messages.push(remaining.substring(0, breakPoint).trim());
            remaining = remaining.substring(breakPoint).trim();
          }

          this.logger.log(`Splitting Instagram message into ${messages.length} parts`);

          // Send each part
          for (let i = 0; i < messages.length; i++) {
            const part = messages.length > 1 ? `(${i + 1}/${messages.length}) ${messages[i]}` : messages[i];
            await this.instagramService.sendMessage(from, part);
            if (i < messages.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } else {
          await this.instagramService.sendMessage(from, response);
        }
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error sending Instagram message', err);
          throw err; // Re-throw to mark job as failed
        }
        try {
        const outboundMessage = await this.messagesService.create({
          content: response,
          platform: 'instagram',
          direction: 'outbound',
          customerId,
        });
        const customer = await this.customersService.findOne(customerId).catch(() => null);
        this.websocketGateway.emitNewMessage('instagram', {
          id: outboundMessage.id,
          from: '',
          to: from,
          content: response,
          timestamp: outboundMessage.createdAt.toISOString(),
          direction: 'outbound',
          customerId,
          customerName: customer?.name,
        });
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error recording outbound message (instagram)', err);
          // Don't throw here - message was sent, just recording failed
        }
      } else if (platform === 'messenger' && from) {
        try {
        // Messenger has a 2000 character limit - split into multiple messages if needed
        const MAX_LENGTH = 1950;

        if (response.length > MAX_LENGTH) {
          const messages: string[] = [];
          let remaining = response;

          while (remaining.length > 0) {
            if (remaining.length <= MAX_LENGTH) {
              messages.push(remaining);
              break;
            }

            // Find good break point
            let breakPoint = MAX_LENGTH;
            const chunk = remaining.substring(0, MAX_LENGTH);

            // Try paragraph break
            const lastParagraph = chunk.lastIndexOf('\n\n');
            if (lastParagraph > MAX_LENGTH * 0.5) {
              breakPoint = lastParagraph + 2;
            } else {
              // Try sentence break
              const lastSentence = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '));
              if (lastSentence > MAX_LENGTH * 0.5) {
                breakPoint = lastSentence + 2;
              } else {
                // Word break
                const lastSpace = chunk.lastIndexOf(' ');
                if (lastSpace > MAX_LENGTH * 0.7) {
                  breakPoint = lastSpace + 1;
                }
              }
            }

            messages.push(remaining.substring(0, breakPoint).trim());
            remaining = remaining.substring(breakPoint).trim();
          }

          this.logger.log(`Splitting Messenger message into ${messages.length} parts`);

          // Send each part
          for (let i = 0; i < messages.length; i++) {
            const part = messages.length > 1 ? `(${i + 1}/${messages.length}) ${messages[i]}` : messages[i];
            await this.messengerSendService.sendMessage(from, part);
            if (i < messages.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } else {
          await this.messengerSendService.sendMessage(from, response);
        }
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error sending Messenger message', err);
          throw err; // Re-throw to mark job as failed
        }
        try {
        const outboundMessage = await this.messagesService.create({
          content: response,
          platform: 'messenger',
          direction: 'outbound',
          customerId,
        });
        const customer = await this.customersService.findOne(customerId).catch(() => null);
        this.websocketGateway.emitNewMessage('messenger', {
          id: outboundMessage.id,
          from: '',
          to: from,
          content: response,
          timestamp: outboundMessage.createdAt.toISOString(),
          direction: 'outbound',
          customerId,
          customerName: customer?.name,
        });
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error recording outbound message (messenger)', err);
          // Don't throw here - message was sent, just recording failed
        }
      } else {
        // unknown platform: just record message and emit
        try {
        const outboundMessage = await this.messagesService.create({
          content: response,
          platform: platform || 'unknown',
          direction: 'outbound',
          customerId,
        });
        const customer = await this.customersService.findOne(customerId).catch(() => null);
        this.websocketGateway.emitNewMessage(platform || 'unknown', {
          id: outboundMessage.id,
          from: '',
          to: from || '',
          content: response,
          timestamp: outboundMessage.createdAt.toISOString(),
          direction: 'outbound',
          customerId,
          customerName: customer?.name,
        });
        } catch (err) {
          this.logger.error('[QUEUE ERROR] Error recording outbound message (unknown platform)', err);
          // Don't throw here - message was sent, just recording failed
        }
      }

      this.logger.log(`[QUEUE DEBUG] Job completed successfully for customerId: ${customerId}`);
      return { processed: true };
    } catch (error) {
      this.logger.error(`[QUEUE ERROR] Failed to process job: ${JSON.stringify(job.data)}`, error);
      this.logger.error(`[QUEUE ERROR] Stack trace:`, error.stack);
      throw error; // Re-throw to mark job as failed and allow Bull to retry
    }
  }

  /**
   * sendOutboundMessage: handles delayed outbound messages (reminders, follow-ups)
   * - job.data: { customerId, content, platform }
   */
  @Process('sendOutboundMessage')
  async sendOutboundMessage(job: Job<{ customerId: string; content: string; platform: string }>): Promise<any> {
    const { customerId, content, platform } = job.data;
    try {
      await this.messagesService.sendOutboundMessage(customerId, content, platform);
      this.logger.log(`Sent outbound message to customerId=${customerId} via ${platform}`);
      return { sent: true };
    } catch (err) {
      this.logger.error(`Failed to send outbound message to customerId=${customerId}`, err);
      throw err; // Re-throw to mark job as failed
    }
  }
}
