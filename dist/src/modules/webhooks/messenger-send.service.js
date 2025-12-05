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
var MessengerSendService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessengerSendService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const customers_service_1 = require("../customers/customers.service");
const messages_service_1 = require("../messages/messages.service");
let MessengerSendService = MessengerSendService_1 = class MessengerSendService {
    constructor(configService, customersService, messagesService) {
        this.configService = configService;
        this.customersService = customersService;
        this.messagesService = messagesService;
        this.logger = new common_1.Logger(MessengerSendService_1.name);
        this.pageAccessToken = this.configService.get('FB_PAGE_ACCESS_TOKEN');
        this.pageId = this.configService.get('FB_PAGE_ID');
        this.logger.log('📘 Initializing Messenger Send Service');
        this.logger.log(`   Page ID: ${this.pageId}`);
        this.logger.log(`   Access Token present: ${!!this.pageAccessToken}`);
        if (!this.pageId || !this.pageAccessToken) {
            this.logger.error('❌ Messenger config missing: FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN');
        }
    }
    async canSendMessage(messengerId) {
        const customer = await this.customersService.findByMessengerId(messengerId);
        if (!customer?.lastMessengerMessageAt) {
            return {
                allowed: false,
                reason: 'User has not messaged you yet. Messenger only allows replies to users who message you first.'
            };
        }
        const now = new Date();
        const hoursSinceLastMessage = (now.getTime() - customer.lastMessengerMessageAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastMessage > 24) {
            return {
                allowed: false,
                reason: '24-hour messaging window has expired. User must send a new message first.',
                lastMessageAt: customer.lastMessengerMessageAt
            };
        }
        const hoursRemaining = 24 - hoursSinceLastMessage;
        return {
            allowed: true,
            lastMessageAt: customer.lastMessengerMessageAt,
            hoursRemaining
        };
    }
    async sendMessage(recipientId, message) {
        this.logger.log(`📤 Sending Messenger message to: ${recipientId}`);
        this.logger.log(`Message: ${message.substring(0, 100)}...`);
        const canSend = await this.canSendMessage(recipientId);
        if (!canSend.allowed) {
            this.logger.error(`❌ Cannot send message: ${canSend.reason}`);
            throw new Error(canSend.reason);
        }
        this.logger.log(`✅ Within 24-hour window (${canSend.hoursRemaining?.toFixed(1)} hours remaining)`);
        try {
            if (!this.pageAccessToken) {
                throw new Error('pageAccessToken is undefined - check FB_PAGE_ACCESS_TOKEN in .env');
            }
            const url = `https://graph.facebook.com/v21.0/me/messages`;
            const payload = {
                recipient: { id: recipientId },
                message: { text: message },
                messaging_type: 'RESPONSE',
            };
            const response = await axios_1.default.post(url, payload, {
                params: {
                    access_token: this.pageAccessToken
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            this.logger.log('✔️ Messenger API response:', response.data);
            const customer = await this.customersService.findByMessengerId(recipientId);
            if (customer) {
                await this.messagesService.create({
                    content: message,
                    platform: 'messenger',
                    direction: 'outbound',
                    customerId: customer.id,
                });
            }
            return response.data;
        }
        catch (error) {
            this.logger.error('❌ Messenger send error:', error.response?.data || error.message);
            throw error;
        }
    }
    async testConnection() {
        try {
            const url = `https://graph.facebook.com/v21.0/${this.pageId}`;
            const response = await axios_1.default.get(url, {
                params: {
                    fields: 'name,id',
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
            this.logger.error('Messenger connection test error:', e.response?.data || e.message);
            return { success: false, message: 'Connection failed: ' + (e.response?.data?.error?.message || e.message) };
        }
    }
};
exports.MessengerSendService = MessengerSendService;
exports.MessengerSendService = MessengerSendService = MessengerSendService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        customers_service_1.CustomersService,
        messages_service_1.MessagesService])
], MessengerSendService);
//# sourceMappingURL=messenger-send.service.js.map