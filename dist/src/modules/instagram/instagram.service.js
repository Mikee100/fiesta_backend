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
exports.InstagramService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const axios_1 = require("axios");
const messages_service_1 = require("../messages/messages.service");
const customers_service_1 = require("../customers/customers.service");
let InstagramService = class InstagramService {
    constructor(configService, messagesService, customersService, messageQueue) {
        this.configService = configService;
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.messageQueue = messageQueue;
        this.accessToken = this.configService.get('INSTAGRAM_ACCESS_TOKEN');
        this.pageAccessToken = this.configService.get('INSTAGRAM_PAGE_ACCESS_TOKEN');
        this.businessAccountId = this.configService.get('INSTAGRAM_BUSINESS_ACCOUNT_ID');
        this.pageId = this.configService.get('INSTAGRAM_PAGE_ID');
        console.log('📷 Initializing Instagram:', '\n businessAccountId:', this.businessAccountId, '\n pageId:', this.pageId, '\n accessToken present:', !!this.accessToken, '\n pageAccessToken present:', !!this.pageAccessToken);
        if (!this.businessAccountId || !this.pageId || !this.pageAccessToken) {
            console.error('❌ Instagram config missing: businessAccountId, pageId, or pageAccessToken');
        }
    }
    verifyWebhook(mode, challenge, token) {
        if (mode === 'subscribe' &&
            token === this.configService.get('INSTAGRAM_VERIFY_TOKEN')) {
            return challenge;
        }
        throw new Error('Invalid token');
    }
    async handleWebhook(body) {
        return { status: 'ok' };
    }
    async processMessage(value) {
        const message = value.messaging[0];
        if (message.message?.text) {
            const from = message.sender.id;
            const text = message.message.text;
            let customer = await this.customersService.findByInstagramId(from);
            if (!customer) {
                customer = await this.customersService.create({
                    name: `Instagram User ${from}`,
                    email: `${from}@instagram.local`,
                    instagramId: from,
                });
            }
            await this.messagesService.create({
                content: text,
                platform: 'instagram',
                direction: 'inbound',
                customerId: customer.id,
            });
        }
    }
    async canSendMessage(instagramId) {
        const customer = await this.customersService.findByInstagramId(instagramId);
        if (!customer?.lastInstagramMessageAt) {
            return {
                allowed: false,
                reason: 'User has not messaged you yet. Instagram only allows replies to users who message you first.'
            };
        }
        const now = new Date();
        const hoursSinceLastMessage = (now.getTime() - customer.lastInstagramMessageAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastMessage > 24) {
            return {
                allowed: false,
                reason: '24-hour messaging window has expired. User must send a new message first.',
                lastMessageAt: customer.lastInstagramMessageAt
            };
        }
        const hoursRemaining = 24 - hoursSinceLastMessage;
        return {
            allowed: true,
            lastMessageAt: customer.lastInstagramMessageAt,
            hoursRemaining
        };
    }
    async sendMessage(to, message) {
        console.log('📤 Sending Instagram message to:', to);
        console.log('Message:', message);
        const canSend = await this.canSendMessage(to);
        if (!canSend.allowed) {
            console.error('❌ Cannot send message:', canSend.reason);
            throw new Error(canSend.reason);
        }
        console.log(`✅ Within 24-hour window (${canSend.hoursRemaining?.toFixed(1)} hours remaining)`);
        try {
            if (!this.pageId) {
                throw new Error('pageId is undefined - check INSTAGRAM_PAGE_ID in .env');
            }
            if (!this.pageAccessToken) {
                throw new Error('pageAccessToken is undefined - check INSTAGRAM_PAGE_ACCESS_TOKEN in .env');
            }
            const url = `https://graph.facebook.com/v21.0/${this.pageId}/messages`;
            const payload = {
                recipient: { id: to },
                message: { text: message },
                messaging_type: "RESPONSE",
            };
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${this.pageAccessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            console.log('✔️ Instagram API response:', response.data);
            const customer = await this.customersService.findByInstagramId(to);
            if (customer) {
                await this.messagesService.create({
                    content: message,
                    platform: 'instagram',
                    direction: 'outbound',
                    customerId: customer.id,
                });
            }
            return response.data;
        }
        catch (error) {
            console.error('❌ Instagram send error:', error.response?.data || error.message);
            throw error;
        }
    }
    async getMessages(options) {
        const messages = await this.messagesService.findAll();
        let filtered = messages.filter(m => m.platform === 'instagram');
        if (options.customerId) {
            filtered = filtered.filter(m => m.customerId === options.customerId);
        }
        if (options.direction) {
            filtered = filtered.filter(m => m.direction === options.direction);
        }
        const total = filtered.length;
        let paginated = filtered;
        if (options.page && options.limit) {
            const start = (options.page - 1) * options.limit;
            paginated = filtered.slice(start, start + options.limit);
        }
        return {
            messages: paginated.map(m => ({
                id: m.id,
                from: m.direction === 'inbound'
                    ? m.customer.instagramId || m.customer.phone
                    : '',
                to: m.direction === 'outbound'
                    ? m.customer.instagramId || m.customer.phone
                    : '',
                content: m.content,
                timestamp: m.createdAt.toISOString(),
                direction: m.direction,
                customerId: m.customerId,
                customerName: m.customer.name,
            })),
            total,
        };
    }
    async getConversations() {
        const messages = await this.messagesService.findAll();
        const ig = messages.filter(m => m.platform === 'instagram');
        const conversations = ig.reduce((acc, msg) => {
            const cid = msg.customerId;
            if (!acc[cid]) {
                acc[cid] = {
                    customerId: cid,
                    customerName: msg.customer.name,
                    instagramId: msg.customer.instagramId,
                    latestMessage: msg.content,
                    latestTimestamp: msg.createdAt.toISOString(),
                    unreadCount: msg.direction === 'inbound' ? 1 : 0,
                };
            }
            else {
                if (new Date(msg.createdAt) > new Date(acc[cid].latestTimestamp)) {
                    acc[cid].latestMessage = msg.content;
                    acc[cid].latestTimestamp = msg.createdAt.toISOString();
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
            businessAccountId: this.businessAccountId,
            accessToken: this.accessToken,
            verifyToken: this.configService.get('INSTAGRAM_VERIFY_TOKEN'),
            webhookUrl: this.configService.get('INSTAGRAM_WEBHOOK_URL'),
        };
    }
    async updateSettings(settings) {
        return { success: true };
    }
    async testConnection() {
        try {
            const url = `https://graph.facebook.com/v21.0/${this.pageId}`;
            const response = await axios_1.default.get(url, {
                params: {
                    fields: 'name,instagram_business_account',
                    access_token: this.pageAccessToken,
                },
            });
            if (response.data.name) {
                return { success: true, message: 'Connection OK - ' + response.data.name };
            }
            else {
                return { success: false, message: 'Connection failed - invalid response' };
            }
        }
        catch (e) {
            console.error('Instagram connection test error:', e.response?.data || e.message);
            return { success: false, message: 'Connection failed: ' + (e.response?.data?.error?.message || e.message) };
        }
    }
};
exports.InstagramService = InstagramService;
exports.InstagramService = InstagramService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, bull_1.InjectQueue)('messageQueue')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        messages_service_1.MessagesService,
        customers_service_1.CustomersService, Object])
], InstagramService);
//# sourceMappingURL=instagram.service.js.map