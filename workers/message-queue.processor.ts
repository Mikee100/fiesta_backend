import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MessagesService } from '../src/modules/messages/messages.service';
import { AiService } from '../src/modules/ai/ai.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { WhatsappService } from '../src/modules/whatsapp/whatsapp.service';
import { InstagramService } from '../src/modules/instagram/instagram.service';
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
    private websocketGateway: WebsocketGateway,
  ) {}

  /**
   * process: main worker function for incoming messages
   * - job.data can be { messageId } (preferred) or { customerId, message, platform, from }
   */
  @Process('processMessage')
  async process(job: Job<any>): Promise<any> {
    let customerId: string;
    let messageContent: string;
    let platform: 'whatsapp' | 'instagram' | string | undefined;
    let from: string | undefined;

    // 1) Load incoming message (either by id or by payload)
    if (job.data.messageId) {
      const message = await this.messagesService.findOne(job.data.messageId);
      if (!message) {
        this.logger.warn('Message not found for job', job.data);
        return { processed: false, error: 'Message not found' };
      }
      customerId = message.customerId;
      messageContent = message.content;
      platform = message.platform;
      from = (message.customer as any)?.whatsappId || (message.customer as any)?.instagramId || (message.customer as any)?.phone;
    } else {
      ({ customerId, message: messageContent, platform, from } = job.data);
      if (!customerId || !messageContent) {
        this.logger.warn('Invalid job payload', job.data);
        return { processed: false, error: 'Invalid job payload' };
      }
    }

    // 2) Load recent conversation history for context (last N messages)
    const historyMessagesRaw = await this.messagesService.findByCustomer(customerId);
    const historyMessages = historyMessagesRaw
      .filter(m => m.direction === 'inbound' || m.direction === 'outbound')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-this.HISTORY_LIMIT);

    const history = historyMessages.map(m => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
      createdAt: m.createdAt,
    }));

    // 3) Duplicate inbound detection:
    // If the most recent inbound message (before this one) is identical and there is already a matching outbound response,
    // we skip to avoid duplicates. This prevents the webhook's duplicate events or double-processing.
    const lastInbound = [...history].reverse().find(h => h.role === 'user');
    const lastOutbound = [...history].reverse().find(h => h.role === 'assistant');

    if (lastInbound && lastInbound.content === messageContent) {
      // If we already replied to that inbound (lastOutbound exists and its createdAt is after lastInbound.createdAt), skip processing.
      if (lastOutbound && new Date(lastOutbound.createdAt) > new Date(lastInbound.createdAt)) {
        this.logger.log('Duplicate inbound detected; skipping processing to avoid double reply.');
        return { processed: true, skippedDuplicate: true };
      }
    }

    // 4) Use AI service to handle the entire conversation (it manages intent, extraction, draft, and generates human-like responses)
    let response = '';
    let draft: any = null;

    try {
      const result = await this.aiService.handleConversation(messageContent, customerId, history as any, this.bookingsService);
      response = result.response;
      draft = result.draft;
    } catch (err) {
      this.logger.error('Error in AI conversation handling', err);
      response = 'Sorry — I had trouble processing that. Could you please rephrase?';
    }

    // 11) Send reply back via channel and record message. Always create outbound message record exactly once.
    if (platform === 'whatsapp' && from) {
      try {
        await this.whatsappService.sendMessage(from, response);
      } catch (err) {
        this.logger.error('Error sending WhatsApp message', err);
        return { processed: false, error: 'Failed to send WhatsApp message' };
      }
      try {
        const outboundMessage = await this.messagesService.create({
          content: response,
          platform: 'whatsapp',
          direction: 'outbound',
          customerId,
        });
        // Emit to websocket (non-blocking)
        const customer = await this.customersService.findOne(customerId).catch(()=>null);
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
      } catch (err) {
        this.logger.error('Error recording outbound message', err);
      }
    } else if (platform === 'instagram' && from) {
      try {
        await this.instagramService.sendMessage(from, response);
      } catch (err) {
        this.logger.error('Error sending Instagram message', err);
        return { processed: false, error: 'Failed to send Instagram message' };
      }
      try {
        const outboundMessage = await this.messagesService.create({
          content: response,
          platform: 'instagram',
          direction: 'outbound',
          customerId,
        });
        const customer = await this.customersService.findOne(customerId).catch(()=>null);
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
        this.logger.error('Error recording outbound message (instagram)', err);
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
        const customer = await this.customersService.findOne(customerId).catch(()=>null);
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
        this.logger.error('Error recording outbound message (unknown platform)', err);
      }
    }

    return { processed: true };
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
