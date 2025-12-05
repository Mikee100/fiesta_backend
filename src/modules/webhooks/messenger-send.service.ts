import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CustomersService } from '../customers/customers.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class MessengerSendService {
    private readonly logger = new Logger(MessengerSendService.name);
    private pageAccessToken: string;
    private pageId: string;

    constructor(
        private configService: ConfigService,
        private customersService: CustomersService,
        private messagesService: MessagesService,
    ) {
        this.pageAccessToken = this.configService.get('FB_PAGE_ACCESS_TOKEN');
        this.pageId = this.configService.get('FB_PAGE_ID');

        this.logger.log('📘 Initializing Messenger Send Service');
        this.logger.log(`   Page ID: ${this.pageId}`);
        this.logger.log(`   Access Token present: ${!!this.pageAccessToken}`);

        if (!this.pageId || !this.pageAccessToken) {
            this.logger.error('❌ Messenger config missing: FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN');
        }
    }

    /**
     * Check if we can send a message (24-hour window)
     */
    async canSendMessage(messengerId: string): Promise<{
        allowed: boolean;
        reason?: string;
        lastMessageAt?: Date;
        hoursRemaining?: number;
    }> {
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

    /**
     * Send a message to a Messenger user
     */
    async sendMessage(recipientId: string, message: string): Promise<any> {
        this.logger.log(`📤 Sending Messenger message to: ${recipientId}`);
        this.logger.log(`Message: ${message.substring(0, 100)}...`);

        // Check 24-hour window
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

            const response = await axios.post(url, payload, {
                params: {
                    access_token: this.pageAccessToken
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            this.logger.log('✔️ Messenger API response:', response.data);

            // Save outbound message
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

        } catch (error) {
            this.logger.error('❌ Messenger send error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Test connection to Messenger API
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const url = `https://graph.facebook.com/v21.0/${this.pageId}`;
            const response = await axios.get(url, {
                params: {
                    fields: 'name,id',
                    access_token: this.pageAccessToken,
                },
            });

            if (response.data.name) {
                return { success: true, message: 'Connection OK - ' + response.data.name };
            } else {
                return { success: false, message: 'Connection failed - invalid response' };
            }
        } catch (e) {
            this.logger.error('Messenger connection test error:', e.response?.data || e.message);
            return { success: false, message: 'Connection failed: ' + (e.response?.data?.error?.message || e.message) };
        }
    }
}
