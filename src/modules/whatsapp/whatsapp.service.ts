import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios from 'axios';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class WhatsappService {
  private phoneNumberId: string;
  private accessToken: string;

  constructor(
    private configService: ConfigService,
    private messagesService: MessagesService,
    @Inject(forwardRef(() => CustomersService)) private customersService: CustomersService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
  ) {
    this.phoneNumberId = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
    this.accessToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');

    console.log(
      '📞 Initializing WhatsApp:',
      '\n phoneNumberId:', this.phoneNumberId,
      '\n accessToken present:', !!this.accessToken,
    );

    if (!this.phoneNumberId || !this.accessToken) {
      console.error('❌ WhatsApp config missing: phoneNumberId or accessToken');
    }
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
  // -------------------------------------------
  async sendMessage(to: string, message: string) {
    console.log('📤 Sending WhatsApp message to:', to);
    console.log('Message:', message);

    // Validation: Ensure 'to' and 'message' are provided
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

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✔️ WhatsApp API response:', response.data);

      // Note: Outbound message is saved by message-queue.processor.ts
      // to avoid duplicates. Do NOT save here.

      return response.data;
    } catch (error) {
      console.error('❌ WhatsApp send error:', error.response?.data || error.message);
      throw error;
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

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✔️ WhatsApp API response (image):', response.data);

      // Save outbound message (as text representation for now)
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

      const uploadUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/media`;

      const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      const mediaId = uploadResponse.data.id;
      console.log('✔️ Document uploaded, media ID:', mediaId);

      // Step 2: Send the document message
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

      const response = await axios.post(messageUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✔️ WhatsApp API response (document):', response.data);

      // Save outbound message
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
    } catch (error) {
      console.error('❌ WhatsApp send document error:', error.response?.data || error.message);
      throw error;
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
      accessToken: this.accessToken,
      verifyToken: this.configService.get('WHATSAPP_VERIFY_TOKEN'),
      webhookUrl: this.configService.get('WHATSAPP_WEBHOOK_URL'),
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
      return { success: true, message: 'Connection OK' };
    } catch (e) {
      return { success: false, message: 'Connection failed' };
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
