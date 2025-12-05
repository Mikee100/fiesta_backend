import { Injectable } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
import { AiService } from '../ai/ai.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class WebhooksService {
  constructor(
    private messagesService: MessagesService,
    private customersService: CustomersService,
    private aiService: AiService,
    private aiSettingsService: AiSettingsService,
    private bookingsService: BookingsService,
    private paymentsService: PaymentsService,
    private whatsappService: WhatsappService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
    private websocketGateway: WebsocketGateway,
  ) { }
  async handleWhatsAppWebhook(body: any) {
    if (body.object !== 'whatsapp_business_account') {
      return { status: 'ignored' };
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {

        const value = change.value;

        // PROCESS ONLY IF THERE ARE MESSAGE OBJECTS INSIDE
        if (value?.messages && value.messages.length > 0) {
          await this.processWhatsAppMessage(value);
        }
      }
    }

    return { status: 'ok' };
  }

  async processWhatsAppMessage(value: any) {
    console.log('[AI DEBUG] processWhatsAppMessage called', JSON.stringify(value));
    const messages = value?.messages;
    if (!messages || messages.length === 0) {
      console.log('No messages in webhook payload - ignoring');
      return;
    }

    const message = messages[0];
    const from = message.from;
    const text = message.text?.body;
    const messageId = message.id;

    console.log('Message type:', message.type, 'ID:', message.id);

    if (!text) {
      console.log("Ignoring non-text message");
      return;
    }


    // Find or create customer (and debug log)
    let customer = await this.customersService.findByWhatsappId(from);
    if (customer) {
      console.log(`[AI DEBUG] WhatsApp: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}`);
    } else {
      console.log(`[AI DEBUG] WhatsApp: customer not found for from=${from}`);
      console.log("Creating customer:", from);
      customer = await this.customersService.create({
        name: `WhatsApp User ${from}`,
        whatsappId: from,
        phone: from,
        email: `${from}@whatsapp.local`,
      });
    }

    console.log('Received text message from', from, ':', text);

    // Check duplicates
    const existing = await this.messagesService.findByExternalId(messageId);
    if (existing) {
      console.log("Duplicate inbound message ignored");
      return;
    }

    // Save inbound message
    const created = await this.messagesService.create({
      content: text,
      platform: 'whatsapp',
      direction: 'inbound',
      customerId: customer.id,
      externalId: messageId,
    });

    console.log("Message saved:", created.id);

    // WebSocket
    this.websocketGateway.emitNewMessage('whatsapp', {
      id: created.id,
      from,
      to: '',
      content: text,
      timestamp: created.createdAt.toISOString(),
      direction: 'inbound',
      customerId: customer.id,
      customerName: customer.name,
    });

    // Check if the user sent a phone number (Kenyan format)
    const phoneMatch = text.match(/0\d{9}/); // Matches 0721840961
    if (phoneMatch) {
      const newPhone = phoneMatch[0];
      console.log(`User provided new phone number: ${newPhone}`);

      // Update customer's phone
      await this.customersService.updatePhone(from, newPhone);

      // Check if there's a pending booking draft
      const draft = await this.bookingsService.getBookingDraft(customer.id);
      if (draft) {
        const depositAmount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;

        // Get package details for full price
        const packages = await this.aiService.getCachedPackages();
        const selectedPackage = packages.find(p => p.name === draft.service);
        const fullPrice = selectedPackage?.price || 0;

        // Send deposit confirmation message with all policies (don't initiate payment yet!)
        const confirmationMessage = `Perfect! I have your phone number: ${newPhone} 📱

📦 *${draft.service}*
💰 Full Price: KSH ${fullPrice.toLocaleString()}
💳 Deposit Required: KSH ${depositAmount.toLocaleString()}

📋 *Important Policies:*

💵 *Payment:*
• Remaining balance is due after the shoot

📸 *Photo Delivery:*
• Edited photos delivered in *10 working days*

⏰ *Cancellation/Rescheduling:*
• Must be made at least *72 hours* before your shoot time
• Changes within 72 hours are non-refundable
• Session fee will be forfeited for late cancellations

To confirm your booking and accept these terms, please reply with *"CONFIRM"* and I'll send the M-PESA payment prompt to your phone.

Or reply *"CANCEL"* if you'd like to make changes. 💖`;

        // Send directly via WhatsApp (not via sendOutboundMessage which doesn't actually send)
        await this.whatsappService.sendMessage(from, confirmationMessage);

        console.log(`Deposit confirmation sent to ${newPhone}. Waiting for user confirmation.`);
      }
    } else if (text.toLowerCase() === 'confirm') {
      // User confirmed deposit - now initiate payment
      const draft = await this.bookingsService.getBookingDraft(customer.id);
      if (draft) {
        const customerData = await this.customersService.findOne(customer.id);
        if (customerData?.phone) {
          const amount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;

          try {
            const checkoutId = await this.paymentsService.initiateSTKPush(draft.id, customerData.phone, amount);

            await this.whatsappService.sendMessage(
              from,
              `Payment request sent! Please check your phone and enter your M-PESA PIN to complete the deposit payment. 💳✨`
            );

            console.log(`STK Push initiated for ${customerData.phone}, CheckoutRequestID: ${checkoutId}`);
          } catch (error) {
            console.error('STK Push failed:', error);
            await this.whatsappService.sendMessage(
              from,
              `Sorry, there was an issue initiating payment. Please try again or contact us at ${process.env.CUSTOMER_CARE_PHONE || '0720 111928'}. 💖`
            );
          }
        } else {
          await this.whatsappService.sendMessage(
            from,
            `I don't have your phone number yet. Please share it so I can send the payment request. 📱`
          );
        }
      } else {
        await this.whatsappService.sendMessage(
          from,
          `I don't see a pending booking. Would you like to start a new booking? 💖`
        );
      }
    } else if (text.toLowerCase() === 'cancel') {
      // User wants to cancel/modify
      await this.whatsappService.sendMessage(
        from,
        `No problem! What would you like to change? You can:
• Choose a different package
• Pick a different date/time
• Start over

Just let me know! 💖`
      );
    } else {
      // Check both global AI and customer-specific AI before queuing
      const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
      const customerAiEnabled = customer.aiEnabled ?? true; // Default to true if not set

      if (globalAiEnabled && customerAiEnabled) {
        console.log("Queueing message for AI...");
        await this.messageQueue.add("processMessage", { messageId: created.id });
      } else {
        console.log('AI disabled (global or customer-specific) - message not queued');
      }
    }
  }


  async handleInstagramWebhook(data: any) {
    console.log('Processing Instagram webhook:', JSON.stringify(data, null, 2));

    if (!data.entry || data.entry.length === 0) {
      console.log('No entry in Instagram webhook payload');
      return; // No entries to process
    }

    const entry = data.entry[0];
    if (!entry.messaging || entry.messaging.length === 0) {
      console.log('No messaging in Instagram webhook entry');
      return; // No messages to process
    }

    const message = entry.messaging[0];
    console.log('Instagram message type:', message.message?.text ? 'text' : 'other');

    // Ignore echo messages (messages sent by the bot itself)
    if (message.message?.is_echo) {
      console.log('Ignoring echo message (sent by bot)');
      return;
    }

    if (message.message?.text) {
      const from = message.sender.id;
      const text = message.message.text;
      console.log('Received Instagram text message from', from, ':', text);

      // Find or create customer
      let customer = await this.customersService.findByInstagramId(from);
      if (!customer) {
        console.log('Creating new customer for Instagram ID:', from);
        customer = await this.customersService.create({
          name: `Instagram User ${from}`,
          email: `${from}@instagram.local`,
          instagramId: from,
        });
      }

      console.log('Customer found/created:', customer.id);

      // Update lastInstagramMessageAt for 24hr window tracking
      await this.customersService.updateLastInstagramMessageAt(from, new Date());
      console.log('✅ Updated lastInstagramMessageAt for 24-hour window tracking');

      // Create inbound message
      const createdMessage = await this.messagesService.create({
        content: text,
        platform: 'instagram',
        direction: 'inbound',
        customerId: customer.id,
      });

      console.log('Instagram message created in database:', createdMessage.id);

      // Emit real-time update via WebSocket for inbound message
      this.websocketGateway.emitNewMessage('instagram', {
        id: createdMessage.id,
        from: from,
        to: '',
        content: text,
        timestamp: createdMessage.createdAt.toISOString(),
        direction: 'inbound',
        customerId: customer.id,
        customerName: customer.name,
      });

      // Check both global AI and customer-specific AI before queuing
      const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
      const customerAiEnabled = customer.aiEnabled;

      // Debug: Log customerId and aiEnabled before AI queueing
      console.log(`[AI DEBUG] Instagram: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}`);

      if (globalAiEnabled && customerAiEnabled) {
        // Queue the message for AI processing
        console.log('Adding Instagram message to queue for processing...');
        await this.messageQueue.add('processMessage', {
          messageId: createdMessage.id,
        });
        console.log('Instagram message added to queue successfully');
      } else {
        console.log('AI disabled (global or customer-specific) - Instagram message not queued');
      }
    }
  }

  async verifyInstagramWebhook(mode: string, challenge: string, token: string) {
    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
      return challenge;
    }
    return 'ERROR';
  }

  async handleMessengerWebhook(data: any) {
    // Similar
    const message = data.entry[0].messaging[0];
    const from = message.sender.id;
    const text = message.message.text;

    let customer = await this.customersService.findByEmail(`${from}@messenger.com`);
    if (!customer) {
      customer = await this.customersService.create({
        name: `Messenger User ${from}`,
        email: `${from}@messenger.com`,
      });
    }

    await this.messagesService.create({
      content: text,
      platform: 'messenger',
      direction: 'inbound',
      customerId: customer.id,
    });

    const intent = await this.messagesService.classifyIntent(text);
    if (intent === 'faq') {
      const answer = await this.aiService.answerFaq(text);
      console.log('Send Messenger response:', answer);
    }
  }

  async handleTelegramWebhook(data: any) {
    // Similar
    const message = data.message;
    const from = message.from.id;
    const text = message.text;

    let customer = await this.customersService.findByEmail(`${from}@telegram.org`);
    if (!customer) {
      customer = await this.customersService.create({
        name: `Telegram User ${from}`,
        email: `${from}@telegram.org`,
      });
    }

    await this.messagesService.create({
      content: text,
      platform: 'telegram',
      direction: 'inbound',
      customerId: customer.id,
    });

    const intent = await this.messagesService.classifyIntent(text);
    if (intent === 'faq') {
      const answer = await this.aiService.answerFaq(text);
      console.log('Send Telegram response:', answer);
    }
  }
}
