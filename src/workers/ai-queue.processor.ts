import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../modules/ai/ai.service';
import { MessengerSendService } from '../modules/webhooks/messenger-send.service';
import { WhatsappService } from '../modules/whatsapp/whatsapp.service';
import { InstagramService } from '../modules/instagram/instagram.service';
import { MessagesService } from '../modules/messages/messages.service';
import { CustomersService } from '../modules/customers/customers.service';
import { BookingsService } from '../modules/bookings/bookings.service';
import { WebsocketGateway } from '../websockets/websocket.gateway';

@Processor('aiQueue')
@Injectable()
export class AiQueueProcessor {
  private readonly logger = new Logger(AiQueueProcessor.name);

  constructor(
    private readonly aiService: AiService,
    private readonly messengerSendService: MessengerSendService,
    private readonly whatsappService: WhatsappService,
    private readonly instagramService: InstagramService,
    private readonly messagesService: MessagesService,
    private readonly customersService: CustomersService,
    private readonly bookingsService: BookingsService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Process('handleAiJob')
  async handleAiJob(job: Job) {
    const { customerId, message, platform } = job.data;
    this.logger.log(`Processing centralized AI job: customerId=${customerId}, platform=${platform}, message=${message}`);

    let aiResponse = "Sorry, I couldn't process your request.";

    try {
      // Get conversation history for context
      const history = await this.messagesService.getConversationHistory(customerId, 10);

      // Generate AI response with timeout
      // Pass bookingsService so booking strategy can work properly
      const aiPromise = this.aiService.handleConversation(message, customerId, history, this.bookingsService);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI processing timeout')), 30000) // 30 second timeout
      );

      const aiResult = await Promise.race([aiPromise, timeoutPromise]);
      this.logger.debug(`AI result: ${JSON.stringify(aiResult)}`);

      if (aiResult?.response) {
        if (typeof aiResult.response === 'string') {
          aiResponse = aiResult.response;
        } else if (typeof aiResult.response === 'object' && aiResult.response !== null) {
          if ('text' in aiResult.response) {
            aiResponse = aiResult.response.text;
          } else {
            this.logger.warn(`AI result has unexpected object format: ${JSON.stringify(aiResult.response)}`);
            aiResponse = "Sorry, I couldn't process your request.";
          }
        } else {
          this.logger.warn(`AI result response is in unexpected format: ${typeof aiResult.response}`);
          aiResponse = "Sorry, I couldn't process your request.";
        }
      } else {
        this.logger.warn(`AI result has no response. Full result: ${JSON.stringify(aiResult)}`);
        aiResponse = "Sorry, I couldn't process your request.";
      }
    } catch (error) {
      this.logger.error('AI processing failed, using fallback response', error);
      this.logger.error('Error details:', error instanceof Error ? error.stack : error);
      // aiResponse is already set to fallback
    }

    // Send response based on platform
    await this.sendResponseByPlatform(customerId, aiResponse, platform);
    this.logger.log(`AI response sent to ${platform}.`);
  }

  private async sendResponseByPlatform(customerId: string, response: string, platform: string) {
    const customer = await this.customersService.findOne(customerId);
    if (!customer) {
      this.logger.error('Customer not found, cannot send response');
      return;
    }

    try {
      // Create outbound message record
      const outboundMessage = await this.messagesService.create({
        content: response,
        platform: platform,
        direction: 'outbound',
        customerId,
      });

      // Send via appropriate platform service
      switch (platform) {
        case 'whatsapp':
          if (customer.whatsappId) {
            await this.whatsappService.sendMessage(customer.whatsappId, response);
          } else {
            this.logger.error('Customer does not have WhatsApp ID');
            return;
          }
          break;

        case 'instagram':
          if (customer.instagramId) {
            await this.instagramService.sendMessage(customer.instagramId, response);
          } else {
            this.logger.error('Customer does not have Instagram ID');
            return;
          }
          break;

        case 'messenger':
          if (customer.messengerId) {
            await this.messengerSendService.sendMessage(customer.messengerId, response);
          } else {
            this.logger.error('Customer does not have Messenger ID');
            return;
          }
          break;

        default:
          this.logger.warn(`Unknown platform: ${platform}, cannot send response`);
          return;
      }

      // Emit WebSocket update
      this.websocketGateway.emitNewMessage(platform, {
        id: outboundMessage.id,
        from: '',
        to: customer.whatsappId || customer.instagramId || customer.messengerId || '',
        content: response,
        timestamp: outboundMessage.createdAt.toISOString(),
        direction: 'outbound',
        customerId,
        customerName: customer.name,
      });

    } catch (error) {
      this.logger.error(`Error sending ${platform} response`, error);
    }
  }
}
