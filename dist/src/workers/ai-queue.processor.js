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
    constructor(aiService, messengerSendService, whatsappService, instagramService, messagesService, customersService, bookingsService, websocketGateway) {
        this.aiService = aiService;
        this.messengerSendService = messengerSendService;
        this.whatsappService = whatsappService;
        this.instagramService = instagramService;
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.bookingsService = bookingsService;
        this.websocketGateway = websocketGateway;
        this.logger = new common_1.Logger(AiQueueProcessor_1.name);
    }
    async handleAiJob(job) {
        const { customerId, message, platform } = job.data;
        this.logger.log(`Processing centralized AI job: customerId=${customerId}, platform=${platform}, message=${message}`);
        let aiResponse = "Sorry, I couldn't process your request.";
        try {
            const history = await this.messagesService.getConversationHistory(customerId, 10);
            const aiPromise = this.aiService.handleConversation(message, customerId, history, this.bookingsService);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI processing timeout')), 30000));
            const aiResult = await Promise.race([aiPromise, timeoutPromise]);
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
        await this.sendResponseByPlatform(customerId, aiResponse, platform);
        this.logger.log(`AI response sent to ${platform}.`);
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
                        await this.instagramService.sendMessage(customer.instagramId, response);
                    }
                    else {
                        this.logger.error('Customer does not have Instagram ID');
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
    (0, bull_1.Process)('handleAiJob'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiQueueProcessor.prototype, "handleAiJob", null);
exports.AiQueueProcessor = AiQueueProcessor = AiQueueProcessor_1 = __decorate([
    (0, bull_1.Processor)('aiQueue'),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        messenger_send_service_1.MessengerSendService,
        whatsapp_service_1.WhatsappService,
        instagram_service_1.InstagramService,
        messages_service_1.MessagesService,
        customers_service_1.CustomersService,
        bookings_service_1.BookingsService,
        websocket_gateway_1.WebsocketGateway])
], AiQueueProcessor);
//# sourceMappingURL=ai-queue.processor.js.map