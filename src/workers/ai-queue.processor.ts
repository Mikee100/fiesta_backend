import { Processor, Process, InjectQueue, OnQueueError, OnQueueFailed, OnQueueResumed } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
export class AiQueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(AiQueueProcessor.name);

  constructor(
    @InjectQueue('aiQueue') private readonly aiQueue: Queue,
    private readonly aiService: AiService,
    private readonly messengerSendService: MessengerSendService,
    private readonly whatsappService: WhatsappService,
    private readonly instagramService: InstagramService,
    private readonly messagesService: MessagesService,
    private readonly customersService: CustomersService,
    private readonly bookingsService: BookingsService,
    private readonly websocketGateway: WebsocketGateway,
  ) {
    this.logger.log('[AI QUEUE] Constructor called - AiQueueProcessor being created');
  }

  onModuleInit() {
    this.logger.log('[AI QUEUE] OnModuleInit called - AiQueueProcessor initialized and ready to process jobs');
    this.logger.log('[AI QUEUE] Listening for jobs on queue: aiQueue');

    // Heartbeat to confirm it's alive periodically (every 1 min)
    setInterval(() => {
      this.logger.debug('[AI QUEUE] Worker heartbeat - active and listening');
    }, 60000);
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error('[AI QUEUE] Queue Error', error);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`[AI QUEUE] Job ${job.id} failed`, error);
  }

  @OnQueueResumed()
  onResumed() {
    this.logger.log('[AI QUEUE] Queue resumed');
  }

  @Process('handleAiJob')
  async handleAiJob(job: Job) {
    try {
      this.logger.log(`[AI QUEUE] ===== JOB RECEIVED =====`);
      this.logger.log(`[AI QUEUE] Job ID: ${job.id}`);
      this.logger.log(`[AI QUEUE] Job Name: ${job.name}`);
      this.logger.log(`[AI QUEUE] Job Data: ${JSON.stringify(job.data)}`);

      if (!job.data) {
        const errorMsg = 'Job data is missing';
        this.logger.error(`[AI QUEUE] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const { customerId, message, platform } = job.data;
      this.logger.log(`[AI QUEUE] Processing centralized AI job: customerId=${customerId}, platform=${platform}, message=${message}, jobId=${job.id}`);

      // Explicit log to verify we are about to call the service
      this.logger.log(`[AI QUEUE] Calling aiService.handleConversation for job ${job.id}...`);

      let aiResponse = "Sorry, I couldn't process your request.";

      try {
        // Get conversation history for context
        const history = await this.messagesService.getConversationHistory(customerId, 10);

        // Generate AI response with timeout
        // Pass bookingsService so booking strategy can work properly
        const aiPromise = this.aiService.handleConversation(message, customerId, history, this.bookingsService);

        // Add catch handler to prevent unhandled rejections if timeout fires first
        aiPromise.catch((err) => {
          // This catch handler prevents unhandled rejections if the promise rejects
          // after Promise.race has already completed (e.g., due to timeout)
          this.logger.debug(`[AI QUEUE] AI promise rejected (may be after timeout): ${err.message}`);
        });

        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AI processing timeout forced after 30s')), 30000); // 30 second timeout
        });

        this.logger.log(`[AI QUEUE] Awaiting AI response for job ${job.id}...`);
        const aiResult: any = await Promise.race([aiPromise, timeoutPromise]);
        clearTimeout(timeoutId); // Clear timeout if aiPromise wins
        this.logger.log(`[AI QUEUE] AI response received for job ${job.id}.`);
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

      // Send response based on platform - wrap in try-catch to prevent job crashes
      try {
        this.logger.log(`[AI QUEUE] Attempting to send ${platform} response to customer ${customerId}...`);
        await this.sendResponseByPlatform(customerId, aiResponse, platform);
        this.logger.log(`[AI QUEUE] ✅ AI response sent to ${platform} successfully.`);
      } catch (error) {
        this.logger.error(`[AI QUEUE] ❌ Failed to send response to ${platform}`, error);
        this.logger.error('[AI QUEUE] Error details:', error instanceof Error ? error.stack : error);
        // Don't re-throw - job should complete even if sending fails
      }

      // Return a value so Bull knows the job completed successfully
      return { success: true, platform, customerId };
    } catch (outerError) {
      // Catch any errors that weren't caught in inner try-catch blocks
      this.logger.error('[AI QUEUE] CRITICAL ERROR in handleAiJob', outerError);
      throw outerError; // Re-throw so Bull marks the job as failed
    }
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
            this.logger.log(`[AI QUEUE] Sending Instagram response to customer ${customerId} (instagramId: ${customer.instagramId})`);
            await this.instagramService.sendMessage(customer.instagramId, response);
            this.logger.log(`[AI QUEUE] Instagram response sent successfully`);
          } else {
            this.logger.error(`[AI QUEUE] Customer ${customerId} does not have Instagram ID - cannot send response`);
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
