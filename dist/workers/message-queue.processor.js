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
const messenger_send_service_1 = require("../src/modules/webhooks/messenger-send.service");
const customers_service_1 = require("../src/modules/customers/customers.service");
const websocket_gateway_1 = require("../src/websockets/websocket.gateway");
let MessageQueueProcessor = MessageQueueProcessor_1 = class MessageQueueProcessor {
    constructor(messagesService, aiService, bookingsService, whatsappService, customersService, instagramService, messengerSendService, websocketGateway) {
        this.messagesService = messagesService;
        this.aiService = aiService;
        this.bookingsService = bookingsService;
        this.whatsappService = whatsappService;
        this.customersService = customersService;
        this.instagramService = instagramService;
        this.messengerSendService = messengerSendService;
        this.websocketGateway = websocketGateway;
        this.logger = new common_1.Logger(MessageQueueProcessor_1.name);
        this.STUDIO_TZ = 'Africa/Nairobi';
        this.HISTORY_LIMIT = 8;
    }
    async process(job) {
        this.logger.log(`[QUEUE DEBUG] Processing job: ${JSON.stringify(job.data)}`);
        try {
            let customerId;
            let messageContent;
            let platform;
            let from;
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
                from = message.customer?.whatsappId || message.customer?.instagramId || message.customer?.phone;
                this.logger.log(`[QUEUE DEBUG] Loaded message - customerId: ${customerId}, platform: ${platform}, content: ${messageContent.substring(0, 50)}...`);
            }
            else {
                ({ customerId, message: messageContent, platform, from } = job.data);
                if (!customerId || !messageContent) {
                    this.logger.warn('Invalid job payload', job.data);
                    return { processed: false, error: 'Invalid job payload' };
                }
            }
            this.logger.log(`[QUEUE DEBUG] Loading enriched context for customerId: ${customerId}`);
            const enrichedContext = await this.messagesService.getEnrichedContext(customerId);
            const history = enrichedContext.history;
            this.logger.log(`[QUEUE DEBUG] Loaded context with ${history.length} history messages`);
            const lastInbound = [...history].reverse().find(h => h.role === 'user');
            const lastOutbound = [...history].reverse().find(h => h.role === 'assistant');
            if (lastInbound && lastInbound.content === messageContent) {
                if (lastOutbound) {
                }
            }
            this.logger.log(`[QUEUE DEBUG] Calling AI service for message: ${messageContent.substring(0, 50)}...`);
            let response = '';
            let mediaUrls = [];
            let draft = null;
            try {
                const result = await this.aiService.handleConversation(messageContent, customerId, history, this.bookingsService, 0, enrichedContext);
                this.logger.log(`[QUEUE DEBUG] AI service returned response: ${typeof result.response === 'string' ? result.response.substring(0, 50) : 'object'}...`);
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
                this.logger.error('[QUEUE ERROR] Error in AI conversation handling', err);
                response = 'Sorry — I had trouble processing that. Could you please rephrase?';
                if (!response) {
                    response = 'I\'m experiencing some technical difficulties. A team member will assist you shortly! 💖';
                }
            }
            this.logger.log(`[QUEUE DEBUG] Preparing to send response via ${platform} to ${from}`);
            if (platform === 'whatsapp' && from) {
                try {
                    this.logger.log(`[QUEUE DEBUG] Sending WhatsApp message to ${from}`);
                    await this.whatsappService.sendMessage(from, response);
                    this.logger.log(`[QUEUE DEBUG] WhatsApp message sent successfully`);
                    if (mediaUrls && mediaUrls.length > 0) {
                        for (const url of mediaUrls) {
                            await this.whatsappService.sendImage(from, url);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
                catch (err) {
                    this.logger.error('[QUEUE ERROR] Error sending WhatsApp message', err);
                    throw err;
                }
                try {
                    this.logger.log(`[QUEUE DEBUG] Recording outbound message in database`);
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
                    this.logger.log(`[QUEUE DEBUG] Outbound message recorded and websocket event emitted`);
                }
                catch (err) {
                    this.logger.error('[QUEUE ERROR] Error recording outbound message', err);
                }
            }
            else if (platform === 'instagram' && from) {
                try {
                    const MAX_LENGTH = 950;
                    if (response.length > MAX_LENGTH) {
                        const messages = [];
                        let remaining = response;
                        while (remaining.length > 0) {
                            if (remaining.length <= MAX_LENGTH) {
                                messages.push(remaining);
                                break;
                            }
                            let breakPoint = MAX_LENGTH;
                            const chunk = remaining.substring(0, MAX_LENGTH);
                            const lastParagraph = chunk.lastIndexOf('\n\n');
                            if (lastParagraph > MAX_LENGTH * 0.5) {
                                breakPoint = lastParagraph + 2;
                            }
                            else {
                                const lastSentence = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '));
                                if (lastSentence > MAX_LENGTH * 0.5) {
                                    breakPoint = lastSentence + 2;
                                }
                                else {
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
                        for (let i = 0; i < messages.length; i++) {
                            const part = messages.length > 1 ? `(${i + 1}/${messages.length}) ${messages[i]}` : messages[i];
                            await this.instagramService.sendMessage(from, part);
                            if (i < messages.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        }
                    }
                    else {
                        await this.instagramService.sendMessage(from, response);
                    }
                }
                catch (err) {
                    this.logger.error('[QUEUE ERROR] Error sending Instagram message', err);
                    throw err;
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
                    this.logger.error('[QUEUE ERROR] Error recording outbound message (instagram)', err);
                }
            }
            else if (platform === 'messenger' && from) {
                try {
                    const MAX_LENGTH = 1950;
                    if (response.length > MAX_LENGTH) {
                        const messages = [];
                        let remaining = response;
                        while (remaining.length > 0) {
                            if (remaining.length <= MAX_LENGTH) {
                                messages.push(remaining);
                                break;
                            }
                            let breakPoint = MAX_LENGTH;
                            const chunk = remaining.substring(0, MAX_LENGTH);
                            const lastParagraph = chunk.lastIndexOf('\n\n');
                            if (lastParagraph > MAX_LENGTH * 0.5) {
                                breakPoint = lastParagraph + 2;
                            }
                            else {
                                const lastSentence = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '));
                                if (lastSentence > MAX_LENGTH * 0.5) {
                                    breakPoint = lastSentence + 2;
                                }
                                else {
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
                        for (let i = 0; i < messages.length; i++) {
                            const part = messages.length > 1 ? `(${i + 1}/${messages.length}) ${messages[i]}` : messages[i];
                            await this.messengerSendService.sendMessage(from, part);
                            if (i < messages.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        }
                    }
                    else {
                        await this.messengerSendService.sendMessage(from, response);
                    }
                }
                catch (err) {
                    this.logger.error('[QUEUE ERROR] Error sending Messenger message', err);
                    throw err;
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
                }
                catch (err) {
                    this.logger.error('[QUEUE ERROR] Error recording outbound message (messenger)', err);
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
                    this.logger.error('[QUEUE ERROR] Error recording outbound message (unknown platform)', err);
                }
            }
            this.logger.log(`[QUEUE DEBUG] Job completed successfully for customerId: ${customerId}`);
            return { processed: true };
        }
        catch (error) {
            this.logger.error(`[QUEUE ERROR] Failed to process job: ${JSON.stringify(job.data)}`, error);
            this.logger.error(`[QUEUE ERROR] Stack trace:`, error.stack);
            throw error;
        }
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
        messenger_send_service_1.MessengerSendService,
        websocket_gateway_1.WebsocketGateway])
], MessageQueueProcessor);
//# sourceMappingURL=message-queue.processor.js.map