import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios from 'axios';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class InstagramService {
  private accessToken: string;
  private pageAccessToken: string;
  private businessAccountId: string;
  private pageId: string;

  constructor(
    private configService: ConfigService,
    private messagesService: MessagesService,
    private customersService: CustomersService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
  ) {
    this.accessToken = this.configService.get('INSTAGRAM_ACCESS_TOKEN');
    this.pageAccessToken = this.configService.get('INSTAGRAM_PAGE_ACCESS_TOKEN');
    this.businessAccountId = this.configService.get('INSTAGRAM_BUSINESS_ACCOUNT_ID');
    this.pageId = this.configService.get('INSTAGRAM_PAGE_ID');

    console.log(
      '📷 Initializing Instagram:',
      '\n businessAccountId:', this.businessAccountId,
      '\n pageId:', this.pageId,
      '\n accessToken present:', !!this.accessToken,
      '\n pageAccessToken present:', !!this.pageAccessToken,
    );

    if (!this.businessAccountId || !this.pageId || !this.pageAccessToken) {
      console.error('❌ Instagram config missing: businessAccountId, pageId, or pageAccessToken');
    }
  }

  // -------------------------------------------
  // WEBHOOK VERIFY
  // -------------------------------------------
  // Instagram uses the same verification as Facebook
  verifyWebhook(mode: string, challenge: string, token: string) {
    if (mode === 'subscribe' &&
      token === this.configService.get('INSTAGRAM_VERIFY_TOKEN')) {
      return challenge;
    }
    throw new Error('Invalid token');
  }

  // -------------------------------------------
  // HANDLE WEBHOOK
  // -------------------------------------------
  // Note: Webhook handling is now done by webhooks.service to avoid duplicates
  async handleWebhook(body: any) {
    // Note: Webhook handling is now done by webhooks.service to avoid duplicates
    return { status: 'ok' };
  }

  // -------------------------------------------
  // PROCESS INBOUND MESSAGE
  // -------------------------------------------
  // This is handled by webhooks.service
  async processMessage(value: any) {
    const message = value.messaging[0];

    if (message.message?.text) {
      const from = message.sender.id;
      const text = message.message.text;

      // Find or create customer
      let customer = await this.customersService.findByInstagramId(from);

      if (!customer) {
        customer = await this.customersService.create({
          name: `Instagram User ${from}`,
          email: `${from}@instagram.local`,
          instagramId: from,
        });
      }

      // Save inbound message
      await this.messagesService.create({
        content: text,
        platform: 'instagram',
        direction: 'inbound',
        customerId: customer.id,
      });

      // Note: AI processing is handled by webhooks.service to avoid duplicates
    }
  }

  // -------------------------------------------
  // SEND INSTAGRAM MESSAGE (GRAPH API)
  // -------------------------------------------
  // Instagram uses Facebook Graph API for messaging
  async canSendMessage(instagramId: string): Promise<{
    allowed: boolean;
    reason?: string;
    lastMessageAt?: Date;
    hoursRemaining?: number;
  }> {
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

  async sendMessage(to: string, message: string) {
    console.log('📤 Sending Instagram message to:', to);
    console.log('Message:', message);

    // Check 24-hour window first
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

      // IMPORTANT: Use Page ID, not Instagram Business Account ID
      const url = `https://graph.facebook.com/v21.0/${this.pageId}/messages`;

      const payload = {
        recipient: { id: to },
        message: { text: message },
        messaging_type: "RESPONSE",
      };

      // IMPORTANT: Use Page Access Token, not User Access Token
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.pageAccessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✔️ Instagram API response:', response.data);

      // Save outbound message
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

    } catch (error) {
      console.error('❌ Instagram send error:', error.response?.data || error.message);
      throw error;
    }
  }

  // -------------------------------------------
  // GET MESSAGES FOR UI
  // -------------------------------------------
  // Similar to WhatsApp
  async getMessages(options: { page?: number; limit?: number; direction?: 'inbound' | 'outbound'; customerId?: string; }) {
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

  // -------------------------------------------
  // GET CONVERSATIONS FOR UI
  // -------------------------------------------
  // Similar to WhatsApp
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
      } else {
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
      conversations: Object.values(conversations).sort(
        (a: any, b: any) =>
          new Date(b.latestTimestamp).getTime() -
          new Date(a.latestTimestamp).getTime()
      ),
      total: Object.keys(conversations).length,
    };
  }

  // -------------------------------------------
  // SETTINGS
  // -------------------------------------------
  // Similar to WhatsApp
  async getSettings() {
    return {
      businessAccountId: this.businessAccountId,
      accessToken: this.accessToken,
      verifyToken: this.configService.get('INSTAGRAM_VERIFY_TOKEN'),
      webhookUrl: this.configService.get('INSTAGRAM_WEBHOOK_URL'),
    };
  }

  async updateSettings(settings: any) {
    return { success: true };
  }

  // -------------------------------------------
  // CONNECTION TEST
  // -------------------------------------------
  // Similar to WhatsApp
  async testConnection() {
    try {
      // Test Instagram API connection using Page ID
      const url = `https://graph.facebook.com/v21.0/${this.pageId}`;
      const response = await axios.get(url, {
        params: {
          fields: 'name,instagram_business_account',
          access_token: this.pageAccessToken,
        },
      });

      if (response.data.name) {
        return { success: true, message: 'Connection OK - ' + response.data.name };
      } else {
        return { success: false, message: 'Connection failed - invalid response' };
      }
    } catch (e) {
      console.error('Instagram connection test error:', e.response?.data || e.message);
      return { success: false, message: 'Connection failed: ' + (e.response?.data?.error?.message || e.message) };
    }
  }
}
