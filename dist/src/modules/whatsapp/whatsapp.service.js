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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const axios_1 = require("axios");
const messages_service_1 = require("../messages/messages.service");
const customers_service_1 = require("../customers/customers.service");
let WhatsappService = class WhatsappService {
    constructor(configService, messagesService, customersService, messageQueue) {
        this.configService = configService;
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.messageQueue = messageQueue;
        this.phoneNumberId = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
        this.accessToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');
        console.log('📞 Initializing WhatsApp:', '\n phoneNumberId:', this.phoneNumberId, '\n accessToken present:', !!this.accessToken);
        if (!this.phoneNumberId || !this.accessToken) {
            console.error('❌ WhatsApp config missing: phoneNumberId or accessToken');
        }
    }
    verifyWebhook(mode, challenge, token) {
        if (mode === 'subscribe' &&
            token === this.configService.get('WHATSAPP_VERIFY_TOKEN')) {
            return challenge;
        }
        throw new Error('Invalid token');
    }
    async handleWebhook(body) {
        return { status: 'ok' };
    }
    async processMessage(value) {
        const message = value.messages[0];
        if (message.type === 'text') {
            const from = message.from;
            const text = message.text.body;
            let customer = await this.customersService.findByWhatsappId(from);
            if (!customer) {
                customer = await this.customersService.create({
                    name: `WhatsApp User ${from}`,
                    email: `${from}@whatsapp.local`,
                    phone: from,
                    whatsappId: from,
                });
            }
            await this.messagesService.create({
                content: text,
                platform: 'whatsapp',
                direction: 'inbound',
                customerId: customer.id,
            });
        }
    }
    async sendMessage(to, message) {
        console.log('📤 Sending WhatsApp message to:', to);
        console.log('Message:', message);
        if (!to || typeof to !== 'string' || !to.trim()) {
            throw new Error("Recipient phone number or WhatsApp ID ('to') is required.");
        }
        if (!message || typeof message !== 'string' || !message.trim()) {
            throw new Error("Message body ('message') is required.");
        }
        try {
            if (!this.phoneNumberId) {
                throw new Error('phoneNumberId is undefined');
            }
            const url = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                to,
                text: { body: message },
            };
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            console.log('✔️ WhatsApp API response:', response.data);
            return response.data;
        }
        catch (error) {
            console.error('❌ WhatsApp send error:', error.response?.data || error.message);
            throw error;
        }
    }
    async sendImage(to, imageUrl, caption) {
        console.log('📤 Sending WhatsApp image to:', to);
        console.log('Image URL:', imageUrl);
        if (!to || !imageUrl) {
            throw new Error("Recipient ('to') and 'imageUrl' are required.");
        }
        try {
            if (!this.phoneNumberId) {
                throw new Error('phoneNumberId is undefined');
            }
            const url = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                to,
                type: "image",
                image: {
                    link: imageUrl,
                    caption: caption || ''
                }
            };
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            console.log('✔️ WhatsApp API response (image):', response.data);
            const customer = await this.customersService.findByWhatsappId(to);
            if (customer) {
                await this.messagesService.create({
                    content: `[Image Sent] ${caption ? caption + ' ' : ''}${imageUrl}`,
                    platform: 'whatsapp',
                    direction: 'outbound',
                    customerId: customer.id,
                });
            }
            return response.data;
        }
        catch (error) {
            console.error('❌ WhatsApp send image error:', error.response?.data || error.message);
            return null;
        }
    }
    async sendDocument(to, filePath, filename, caption) {
        console.log('📤 Sending WhatsApp document to:', to);
        console.log('File path:', filePath);
        if (!to || !filePath) {
            throw new Error("Recipient ('to') and 'filePath' are required.");
        }
        try {
            if (!this.phoneNumberId) {
                throw new Error('phoneNumberId is undefined');
            }
            const FormData = require('form-data');
            const fs = require('fs');
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            formData.append('messaging_product', 'whatsapp');
            formData.append('type', 'application/pdf');
            const uploadUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/media`;
            const uploadResponse = await axios_1.default.post(uploadUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });
            const mediaId = uploadResponse.data.id;
            console.log('✔️ Document uploaded, media ID:', mediaId);
            const messageUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                to,
                type: "document",
                document: {
                    id: mediaId,
                    filename: filename,
                    caption: caption || ''
                }
            };
            const response = await axios_1.default.post(messageUrl, payload, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            console.log('✔️ WhatsApp API response (document):', response.data);
            const customer = await this.customersService.findByWhatsappId(to);
            if (customer) {
                await this.messagesService.create({
                    content: `[Document Sent] ${filename}${caption ? ': ' + caption : ''}`,
                    platform: 'whatsapp',
                    direction: 'outbound',
                    customerId: customer.id,
                });
            }
            return response.data;
        }
        catch (error) {
            console.error('❌ WhatsApp send document error:', error.response?.data || error.message);
            throw error;
        }
    }
    async getMessages(customerId) {
        const messages = await this.messagesService.findAll();
        let filtered = messages.filter(m => m.platform === 'whatsapp');
        if (customerId) {
            filtered = filtered.filter(m => m.customerId === customerId);
        }
        return {
            messages: filtered.map(m => ({
                id: m.id,
                from: m.direction === 'inbound'
                    ? m.customer.whatsappId || m.customer.phone
                    : '',
                to: m.direction === 'outbound'
                    ? m.customer.whatsappId || m.customer.phone
                    : '',
                content: m.content,
                timestamp: m.createdAt.toISOString(),
                direction: m.direction,
                customerId: m.customerId,
                customerName: m.customer.name,
            })),
            total: filtered.length,
        };
    }
    async getConversations() {
        const messages = await this.messagesService.findAll();
        const wa = messages.filter(m => m.platform === 'whatsapp');
        const conversations = wa.reduce((acc, msg) => {
            const cid = msg.customerId;
            if (!acc[cid]) {
                acc[cid] = {
                    customerId: cid,
                    customerName: msg.customer?.name,
                    phone: msg.customer?.whatsappId || msg.customer?.phone,
                    latestMessage: msg.content,
                    latestTimestamp: msg.createdAt?.toISOString?.() || msg.createdAt,
                    unreadCount: msg.direction === 'inbound' ? 1 : 0,
                };
            }
            else {
                if (new Date(msg.createdAt) > new Date(acc[cid].latestTimestamp)) {
                    acc[cid].latestMessage = msg.content;
                    acc[cid].latestTimestamp = msg.createdAt?.toISOString?.() || msg.createdAt;
                }
                if (msg.direction === 'inbound') {
                    acc[cid].unreadCount++;
                }
            }
            return acc;
        }, {});
        return {
            conversations: Object.values(conversations).sort((a, b) => new Date(b.latestTimestamp).getTime() -
                new Date(a.latestTimestamp).getTime()),
            total: Object.keys(conversations).length,
        };
    }
    async getSettings() {
        return {
            phoneNumberId: this.phoneNumberId,
            accessToken: this.accessToken,
            verifyToken: this.configService.get('WHATSAPP_VERIFY_TOKEN'),
            webhookUrl: this.configService.get('WHATSAPP_WEBHOOK_URL'),
        };
    }
    async updateSettings(settings) {
        return { success: true };
    }
    async testConnection() {
        try {
            return { success: true, message: 'Connection OK' };
        }
        catch (e) {
            return { success: false, message: 'Connection failed' };
        }
    }
    async getWhatsAppStats() {
        const totalMessages = await this.messagesService.countMessages({
            where: { platform: 'whatsapp' },
        });
        const inboundMessages = await this.messagesService.countMessages({
            where: { platform: 'whatsapp', direction: 'inbound' },
        });
        const outboundMessages = await this.messagesService.countMessages({
            where: { platform: 'whatsapp', direction: 'outbound' },
        });
        const totalConversations = await this.messagesService.countMessages({
            where: { platform: 'whatsapp' },
            distinct: ['customerId'],
        });
        const activeConversations = await this.messagesService.countMessages({
            where: {
                platform: 'whatsapp',
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
            distinct: ['customerId'],
        });
        return {
            totalMessages,
            inboundMessages,
            outboundMessages,
            totalConversations,
            activeConversations,
        };
    }
};
exports.WhatsappService = WhatsappService;
exports.WhatsappService = WhatsappService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => customers_service_1.CustomersService))),
    __param(3, (0, bull_1.InjectQueue)('messageQueue')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        messages_service_1.MessagesService,
        customers_service_1.CustomersService, Object])
], WhatsappService);
//# sourceMappingURL=whatsapp.service.js.map