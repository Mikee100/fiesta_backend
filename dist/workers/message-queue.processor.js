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
var MessageQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageQueueProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const messages_service_1 = require("../src/modules/messages/messages.service");
const ai_service_1 = require("../src/modules/ai/ai.service");
const bookings_service_1 = require("../src/modules/bookings/bookings.service");
const whatsapp_service_1 = require("../src/modules/whatsapp/whatsapp.service");
const instagram_service_1 = require("../src/modules/instagram/instagram.service");
const customers_service_1 = require("../src/modules/customers/customers.service");
const websocket_gateway_1 = require("../src/websockets/websocket.gateway");
let MessageQueueProcessor = MessageQueueProcessor_1 = class MessageQueueProcessor {
    constructor(messagesService, aiService, bookingsService, whatsappService, customersService, instagramService, websocketGateway) {
        this.messagesService = messagesService;
        this.aiService = aiService;
        this.bookingsService = bookingsService;
        this.whatsappService = whatsappService;
        this.customersService = customersService;
        this.instagramService = instagramService;
        this.websocketGateway = websocketGateway;
        this.logger = new common_1.Logger(MessageQueueProcessor_1.name);
        this.STUDIO_TZ = 'Africa/Nairobi';
        this.HISTORY_LIMIT = 8;
    }
    async process(job) {
        let customerId;
        let messageContent;
        let platform;
        let from;
        if (job.data.messageId) {
            const message = await this.messagesService.findOne(job.data.messageId);
            if (!message) {
                this.logger.warn('Message not found for job', job.data);
                return { processed: false, error: 'Message not found' };
            }
            customerId = message.customerId;
            messageContent = message.content;
            platform = message.platform;
            from = message.customer?.whatsappId || message.customer?.instagramId || message.customer?.phone;
        }
        else {
            ({ customerId, message: messageContent, platform, from } = job.data);
            if (!customerId || !messageContent) {
                this.logger.warn('Invalid job payload', job.data);
                return { processed: false, error: 'Invalid job payload' };
            }
        }
        const enrichedContext = await this.messagesService.getEnrichedContext(customerId);
        const history = enrichedContext.history;
        const lastInbound = [...history].reverse().find(h => h.role === 'user');
        const lastOutbound = [...history].reverse().find(h => h.role === 'assistant');
        if (lastInbound && lastInbound.content === messageContent) {
            if (lastOutbound) {
            }
        }
        let response = '';
        let mediaUrls = [];
        let draft = null;
        try {
            const result = await this.aiService.handleConversation(messageContent, customerId, history, this.bookingsService, 0, enrichedContext);
            if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
                response = result.response.text;
                mediaUrls = result.response.mediaUrls || [];
            }
            else {
                response = typeof result.response === 'string' ? result.response : JSON.stringify(result.response);
            }
            draft = result.draft;
        }
        catch (err) {
            this.logger.error('Error in AI conversation handling', err);
            response = 'Sorry — I had trouble processing that. Could you please rephrase?';
        }
        if (platform === 'whatsapp' && from) {
            try {
                await this.whatsappService.sendMessage(from, response);
                if (mediaUrls && mediaUrls.length > 0) {
                    for (const url of mediaUrls) {
                        await this.whatsappService.sendImage(from, url);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
            catch (err) {
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
            }
            catch (err) {
                this.logger.error('Error recording outbound message', err);
            }
        }
        else if (platform === 'instagram' && from) {
            try {
                await this.instagramService.sendMessage(from, response);
            }
            catch (err) {
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
            }
            catch (err) {
                this.logger.error('Error recording outbound message (instagram)', err);
            }
        }
        else {
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
            }
            catch (err) {
                this.logger.error('Error recording outbound message (unknown platform)', err);
            }
        }
        return { processed: true };
    }
    async sendOutboundMessage(job) {
        const { customerId, content, platform } = job.data;
        try {
            await this.messagesService.sendOutboundMessage(customerId, content, platform);
            this.logger.log(`Sent outbound message to customerId=${customerId} via ${platform}`);
            return { sent: true };
        }
        catch (err) {
            this.logger.error(`Failed to send outbound message to customerId=${customerId}`, err);
            throw err;
        }
    }
};
exports.MessageQueueProcessor = MessageQueueProcessor;
__decorate([
    (0, bull_1.Process)('processMessage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessageQueueProcessor.prototype, "process", null);
__decorate([
    (0, bull_1.Process)('sendOutboundMessage'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessageQueueProcessor.prototype, "sendOutboundMessage", null);
exports.MessageQueueProcessor = MessageQueueProcessor = MessageQueueProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bull_1.Processor)('messageQueue'),
    __metadata("design:paramtypes", [messages_service_1.MessagesService,
        ai_service_1.AiService,
        bookings_service_1.BookingsService,
        whatsapp_service_1.WhatsappService,
        customers_service_1.CustomersService,
        instagram_service_1.InstagramService,
        websocket_gateway_1.WebsocketGateway])
], MessageQueueProcessor);
//# sourceMappingURL=message-queue.processor.js.map