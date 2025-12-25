import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios from 'axios';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';

/**
 * WhatsApp Service - PRODUCTION MODE
 * 
 * This service is configured for PRODUCTION use and accepts messages from ALL phone numbers.
 * There are NO phone number restrictions or whitelists in the code.
 * 
 * To enable production mode in Meta's WhatsApp Business API:
 * 1. Go to Meta Developer Console
 * 2. Select your WhatsApp Business App
 * 3. Navigate to WhatsApp > API Setup
 * 4. Ensure the app is in "Production" mode (not "Development" mode)
 * 5. In Development mode, only test numbers can send/receive messages
 * 6. In Production mode, ALL numbers can send/receive messages
 */
@Injectable()
export class WhatsappService {
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(
    private configService: ConfigService,
    private messagesService: MessagesService,
    @Inject(forwardRef(() => CustomersService)) private customersService: CustomersService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
  ) {
    this.phoneNumberId = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
    this.accessToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');
    this.apiVersion = this.configService.get('WHATSAPP_API_VERSION') || 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    console.log(
      '📞 Initializing WhatsApp:',
      '\n phoneNumberId:', this.phoneNumberId,
      '\n accessToken present:', !!this.accessToken,
      '\n API Version:', this.apiVersion,
    );

    if (!this.phoneNumberId || !this.accessToken) {
      console.error('❌ WhatsApp config missing: phoneNumberId or accessToken');
    }
  }

  // -------------------------------------------
  // HELPER: Build API URL
  // -------------------------------------------
  private getApiUrl(endpoint: string): string {
    return `${this.baseUrl}/${this.phoneNumberId}/${endpoint}`;
  }

  // -------------------------------------------
  // HELPER: Handle API Errors
  // -------------------------------------------
  private handleApiError(error: any, operation: string): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const errorCode = data?.error?.code;
      const errorMessage = data?.error?.message || data?.error?.error_subcode;

      // Test mode restriction - phone number not in allowed list
      // This is expected in development/test mode and should be handled gracefully
      if (status === 400 && (errorCode === 131030 || errorMessage?.includes('not in allowed list'))) {
        const testModeError = new Error(`WhatsApp API error: ${errorMessage || 'Recipient phone number not in allowed list'}`);
        (testModeError as any).isTestModeRestriction = true;
        (testModeError as any).code = 131030;
        console.warn(`⚠️ WhatsApp ${operation} - Test Mode Restriction:`, errorMessage);
        console.warn(`   This is expected in development/test mode. Add phone numbers to your WhatsApp Business API test list.`);
        throw testModeError;
      }

      // Rate limiting (429)
      if (status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 60;
        console.error(`❌ WhatsApp ${operation} - Rate limit exceeded. Retry after ${retryAfter}s`);
        throw new Error(`Rate limit exceeded. Please retry after ${retryAfter} seconds.`);
      }

      // Token expiration (401)
      if (status === 401) {
        console.error(`❌ WhatsApp ${operation} - Unauthorized. Token may be expired or invalid.`);
        throw new Error('WhatsApp access token expired or invalid. Please update your token.');
      }

      // Invalid phone number (400)
      if (status === 400 && errorMessage) {
        console.error(`❌ WhatsApp ${operation} - Bad Request:`, errorMessage);
        throw new Error(`WhatsApp API error: ${errorMessage}`);
      }

      // Generic API error
      console.error(`❌ WhatsApp ${operation} - API Error:`, {
        status,
        error: data?.error || data,
      });
      throw new Error(`WhatsApp API error (${status}): ${errorMessage || 'Unknown error'}`);
    }

    // Network or other errors
    console.error(`❌ WhatsApp ${operation} - Network/Unknown Error:`, error.message);
    throw new Error(`Failed to ${operation}: ${error.message}`);
  }

  // -------------------------------------------
  // WEBHOOK VERIFY
  // -------------------------------------------
  verifyWebhook(mode: string, challenge: string, token: string) {
    if (mode === 'subscribe' &&
      token === this.configService.get('WHATSAPP_VERIFY_TOKEN')) {
      return challenge;
    }
    throw new Error('Invalid token');
  }

  // -------------------------------------------
  // HANDLE WEBHOOK
  // -------------------------------------------
  async handleWebhook(body: any) {
    // Note: Webhook handling is now done by webhooks.service to avoid duplicates
    return { status: 'ok' };
  }

  // -------------------------------------------
  // PROCESS INBOUND MESSAGE
  // -------------------------------------------
  async processMessage(value: any) {
    const message = value.messages[0];

    if (message.type === 'text') {
      const from = message.from;
      const text = message.text.body;

      // Find or create customer
      let customer = await this.customersService.findByWhatsappId(from);

      if (!customer) {
        customer = await this.customersService.create({
          name: `WhatsApp User ${from}`,
          email: `${from}@whatsapp.local`,
          phone: from,
          whatsappId: from,
        });
      }

      // Save inbound message
      await this.messagesService.create({
        content: text,
        platform: 'whatsapp',
        direction: 'inbound',
        customerId: customer.id,
      });

      // Note: AI processing is handled by webhooks.service to avoid duplicates
    }
  }

  // -------------------------------------------
  // SEND WHATSAPP MESSAGE (OFFICIAL API)
  // PRODUCTION MODE: Can send to ANY phone number - no restrictions
  // -------------------------------------------
  async sendMessage(to: string, message: string) {
    console.log('📤 Sending WhatsApp message to:', to);
    console.log('Message:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));

    // Validation: Ensure 'to' and 'message' are provided
    if (!to || typeof to !== 'string' || !to.trim()) {
      throw new Error("Recipient phone number or WhatsApp ID ('to') is required.");
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new Error("Message body ('message') is required.");
    }

    // Validate phone number format (E.164 format recommended)
    let normalizedTo = to.trim().replace(/[^0-9+]/g, '');
    if (!normalizedTo.startsWith('+')) {
      // Automatically add '+' prefix for E.164 format
      normalizedTo = `+${normalizedTo}`;
    }

    try {
      if (!this.phoneNumberId) {
        throw new Error('phoneNumberId is undefined');
      }

      const url = this.getApiUrl('messages');

      const payload = {
        messaging_product: "whatsapp",
        to: normalizedTo,
        text: { body: message },
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout for production
      });

      console.log('✔️ WhatsApp API response:', {
        messageId: response.data?.messages?.[0]?.id,
        status: 'sent',
      });

      // Note: Outbound message is saved by message-queue.processor.ts
      // to avoid duplicates. Do NOT save here.

      return response.data;
    } catch (error) {
      this.handleApiError(error, 'send message');
    }
  }

  // -------------------------------------------
  // SEND WHATSAPP IMAGE (OFFICIAL API)
  // -------------------------------------------
  async sendImage(to: string, imageUrl: string, caption?: string) {
    console.log('📤 Sending WhatsApp image to:', to);
    console.log('Image URL:', imageUrl);

    if (!to || !imageUrl) {
      throw new Error("Recipient ('to') and 'imageUrl' are required.");
    }

    const normalizedTo = to.trim().replace(/[^0-9+]/g, '');

    try {
      if (!this.phoneNumberId) {
        throw new Error('phoneNumberId is undefined');
      }

      const url = this.getApiUrl('messages');

      const payload = {
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: "image",
        image: {
          link: imageUrl,
          caption: caption || ''
        }
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      console.log('✔️ WhatsApp API response (image):', {
        messageId: response.data?.messages?.[0]?.id,
        status: 'sent',
      });

      // Save outbound message (as text representation for now)
      const customer = await this.customersService.findByWhatsappId(normalizedTo);
      if (customer) {
        await this.messagesService.create({
          content: `[Image Sent] ${caption ? caption + ' ' : ''}${imageUrl}`,
          platform: 'whatsapp',
          direction: 'outbound',
          customerId: customer.id,
        });
      }

      return response.data;
    } catch (error) {
      console.error('❌ WhatsApp send image error:', error.response?.data || error.message);
      // Don't throw, just log error so text message still goes through if this fails
      return null;
    }
  }

  // -------------------------------------------
  // SEND WHATSAPP DOCUMENT (OFFICIAL API)
  // -------------------------------------------
  async sendDocument(to: string, filePath: string, filename: string, caption?: string) {
    console.log('📤 Sending WhatsApp document to:', to);
    console.log('File path:', filePath);

    if (!to || !filePath) {
      throw new Error("Recipient ('to') and 'filePath' are required.");
    }

    try {
      if (!this.phoneNumberId) {
        throw new Error('phoneNumberId is undefined');
      }

      // Step 1: Upload the document to WhatsApp Media API
      const FormData = require('form-data');
      const fs = require('fs');
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', 'application/pdf');

      const uploadUrl = this.getApiUrl('media');

      const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 60000, // 60 seconds for file uploads
      });

      const mediaId = uploadResponse.data.id;
      console.log('✔️ Document uploaded, media ID:', mediaId);

      // Step 2: Send the document message
      const messageUrl = this.getApiUrl('messages');

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

      const response = await axios.post(messageUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      console.log('✔️ WhatsApp API response (document):', {
        messageId: response.data?.messages?.[0]?.id,
        status: 'sent',
      });

      // Save outbound message
      const normalizedTo = to.trim().replace(/[^0-9+]/g, '');
      const customer = await this.customersService.findByWhatsappId(normalizedTo);
      if (customer) {
        await this.messagesService.create({
          content: `[Document Sent] ${filename}${caption ? ': ' + caption : ''}`,
          platform: 'whatsapp',
          direction: 'outbound',
          customerId: customer.id,
        });
      }

      return response.data;
    } catch (error) {
      this.handleApiError(error, 'send document');
    }
  }

  // -------------------------------------------
  // GET MESSAGES FOR UI
  // -------------------------------------------
  async getMessages(customerId?: string) {
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

  // -------------------------------------------
  // GET CONVERSATIONS FOR UI
  // -------------------------------------------
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
      } else {
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
  async getSettings() {
    return {
      phoneNumberId: this.phoneNumberId,
      accessToken: this.accessToken ? `${this.accessToken.substring(0, 10)}...` : null, // Mask token for security
      verifyToken: this.configService.get('WHATSAPP_VERIFY_TOKEN') ? '***' : null, // Mask token
      webhookUrl: this.configService.get('WHATSAPP_WEBHOOK_URL'),
      apiVersion: this.apiVersion,
      baseUrl: this.baseUrl,
    };
  }

  async updateSettings(settings: any) {
    return { success: true };
  }

  // -------------------------------------------
  // CONNECTION TEST
  // -------------------------------------------
  async testConnection() {
    try {
      // Test by fetching phone number info (lightweight API call)
      const url = `${this.baseUrl}/${this.phoneNumberId}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 10000,
      });

      return {
        success: true,
        message: 'Connection OK',
        phoneNumber: response.data?.display_phone_number || 'N/A',
        verifiedName: response.data?.verified_name || 'N/A',
      };
    } catch (error) {
      if (error.response?.status === 401) {
        return {
          success: false,
          message: 'Connection failed: Invalid or expired access token',
          error: 'UNAUTHORIZED',
        };
      }
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        error: error.response?.status || 'UNKNOWN',
      };
    }
  }

  // -------------------------------------------
  // GET WHATSAPP STATS
  // -------------------------------------------
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
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
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
}
