"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AiQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiQueueProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const ai_service_1 = require("../modules/ai/ai.service");
const messenger_send_service_1 = require("../modules/webhooks/messenger-send.service");
const whatsapp_service_1 = require("../modules/whatsapp/whatsapp.service");
const instagram_service_1 = require("../modules/instagram/instagram.service");
const messages_service_1 = require("../modules/messages/messages.service");
const customers_service_1 = require("../modules/customers/customers.service");
const bookings_service_1 = require("../modules/bookings/bookings.service");
const websocket_gateway_1 = require("../websockets/websocket.gateway");
let AiQueueProcessor = AiQueueProcessor_1 = class AiQueueProcessor {
    constructor(aiQueue, aiService, messengerSendService, whatsappService, instagramService, messagesService, customersService, bookingsService, websocketGateway) {
        this.aiQueue = aiQueue;
        this.aiService = aiService;
        this.messengerSendService = messengerSendService;
        this.whatsappService = whatsappService;
        this.instagramService = instagramService;
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.bookingsService = bookingsService;
        this.websocketGateway = websocketGateway;
        this.logger = new common_1.Logger(AiQueueProcessor_1.name);
        this.logger.log('[AI QUEUE] Constructor called - AiQueueProcessor being created');
    }
    onModuleInit() {
        this.logger.log('[AI QUEUE] OnModuleInit called - AiQueueProcessor initialized and ready to process jobs');
        this.logger.log('[AI QUEUE] Listening for jobs on queue: aiQueue');
        setInterval(() => {
            this.logger.debug('[AI QUEUE] Worker heartbeat - active and listening');
        }, 60000);
    }
    onError(error) {
        this.logger.error('[AI QUEUE] Queue Error', error);
    }
    onFailed(job, error) {
        this.logger.error(`[AI QUEUE] Job ${job.id} failed`, error);
    }
    onResumed() {
        this.logger.log('[AI QUEUE] Queue resumed');
    }
    async handleAiJob(job) {
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
            this.logger.log(`[AI QUEUE] Calling aiService.handleConversation for job ${job.id}...`);
            let aiResponse = "Sorry, I couldn't process your request.";
            try {
                const history = await this.messagesService.getConversationHistory(customerId, 10);
                const aiPromise = this.aiService.handleConversation(message, customerId, history, this.bookingsService);
                aiPromise.catch((err) => {
                    this.logger.debug(`[AI QUEUE] AI promise rejected (may be after timeout): ${err.message}`);
                });
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('AI processing timeout forced after 30s')), 30000);
                });
                this.logger.log(`[AI QUEUE] Awaiting AI response for job ${job.id}...`);
                const aiResult = await Promise.race([aiPromise, timeoutPromise]);
                clearTimeout(timeoutId);
                this.logger.log(`[AI QUEUE] AI response received for job ${job.id}.`);
                this.logger.debug(`AI result: ${JSON.stringify(aiResult)}`);
                if (aiResult?.response) {
                    if (typeof aiResult.response === 'string') {
                        aiResponse = aiResult.response;
                    }
                    else if (typeof aiResult.response === 'object' && aiResult.response !== null) {
                        if ('text' in aiResult.response) {
                            aiResponse = aiResult.response.text;
                        }
                        else {
                            this.logger.warn(`AI result has unexpected object format: ${JSON.stringify(aiResult.response)}`);
                            aiResponse = "Sorry, I couldn't process your request.";
                        }
                    }
                    else {
                        this.logger.warn(`AI result response is in unexpected format: ${typeof aiResult.response}`);
                        aiResponse = "Sorry, I couldn't process your request.";
                    }
                }
                else {
                    this.logger.warn(`AI result has no response. Full result: ${JSON.stringify(aiResult)}`);
                    aiResponse = "Sorry, I couldn't process your request.";
                }
            }
            catch (error) {
                this.logger.error('AI processing failed, using fallback response', error);
                this.logger.error('Error details:', error instanceof Error ? error.stack : error);
            }
            try {
                this.logger.log(`[AI QUEUE] Attempting to send ${platform} response to customer ${customerId}...`);
                await this.sendResponseByPlatform(customerId, aiResponse, platform);
                this.logger.log(`[AI QUEUE] ✅ AI response sent to ${platform} successfully.`);
            }
            catch (error) {
                this.logger.error(`[AI QUEUE] ❌ Failed to send response to ${platform}`, error);
                this.logger.error('[AI QUEUE] Error details:', error instanceof Error ? error.stack : error);
            }
            return { success: true, platform, customerId };
        }
        catch (outerError) {
            this.logger.error('[AI QUEUE] CRITICAL ERROR in handleAiJob', outerError);
            throw outerError;
        }
    }
    async sendResponseByPlatform(customerId, response, platform) {
        const customer = await this.customersService.findOne(customerId);
        if (!customer) {
            this.logger.error('Customer not found, cannot send response');
            return;
        }
        try {
            const outboundMessage = await this.messagesService.create({
                content: response,
                platform: platform,
                direction: 'outbound',
                customerId,
            });
            switch (platform) {
                case 'whatsapp':
                    if (customer.whatsappId) {
                        await this.whatsappService.sendMessage(customer.whatsappId, response);
                    }
                    else {
                        this.logger.error('Customer does not have WhatsApp ID');
                        return;
                    }
                    break;
                case 'instagram':
                    if (customer.instagramId) {
                        this.logger.log(`[AI QUEUE] Sending Instagram response to customer ${customerId} (instagramId: ${customer.instagramId})`);
                        await this.instagramService.sendMessage(customer.instagramId, response);
                        this.logger.log(`[AI QUEUE] Instagram response sent successfully`);
                    }
                    else {
                        this.logger.error(`[AI QUEUE] Customer ${customerId} does not have Instagram ID - cannot send response`);
                        return;
                    }
                    break;
                case 'messenger':
                    if (customer.messengerId) {
                        await this.messengerSendService.sendMessage(customer.messengerId, response);
                    }
                    else {
                        this.logger.error('Customer does not have Messenger ID');
                        return;
                    }
                    break;
                default:
                    this.logger.warn(`Unknown platform: ${platform}, cannot send response`);
                    return;
            }
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
        }
        catch (error) {
            this.logger.error(`Error sending ${platform} response`, error);
        }
    }
};
exports.AiQueueProcessor = AiQueueProcessor;
__decorate([
    (0, bull_1.OnQueueError)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Error]),
    __metadata("design:returntype", void 0)
], AiQueueProcessor.prototype, "onError", null);
__decorate([
    (0, bull_1.OnQueueFailed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Error]),
    __metadata("design:returntype", void 0)
], AiQueueProcessor.prototype, "onFailed", null);
__decorate([
    (0, bull_1.OnQueueResumed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AiQueueProcessor.prototype, "onResumed", null);
__decorate([
    (0, bull_1.Process)('handleAiJob'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiQueueProcessor.prototype, "handleAiJob", null);
exports.AiQueueProcessor = AiQueueProcessor = AiQueueProcessor_1 = __decorate([
    (0, bull_1.Processor)('aiQueue'),
    (0, common_1.Injectable)(),
    __param(0, (0, bull_1.InjectQueue)('aiQueue')),
    __metadata("design:paramtypes", [Object, ai_service_1.AiService,
        messenger_send_service_1.MessengerSendService,
        whatsapp_service_1.WhatsappService,
        instagram_service_1.InstagramService,
        messages_service_1.MessagesService,
        customers_service_1.CustomersService,
        bookings_service_1.BookingsService,
        websocket_gateway_1.WebsocketGateway])
], AiQueueProcessor);
//# sourceMappingURL=ai-queue.processor.js.map