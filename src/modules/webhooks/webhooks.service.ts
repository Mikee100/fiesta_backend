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
@Injectable()
export class WebhooksService {
  constructor(
  private messagesService: MessagesService,
  private customersService: CustomersService,
  private aiService: AiService,
  private aiSettingsService: AiSettingsService,
  private bookingsService: BookingsService,  // ✅ add this
  private paymentsService: PaymentsService,  // ✅ add this
  @InjectQueue('messageQueue') private messageQueue: Queue,
  private websocketGateway: WebsocketGateway,
  ) {}
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

  console.log('Received text message from', from, ':', text);

  // Check duplicates
  const existing = await this.messagesService.findByExternalId(messageId);
  if (existing) {
    console.log("Duplicate inbound message ignored");
    return;
  }

  // Find or create customer
  let customer = await this.customersService.findByWhatsappId(from);
  if (!customer) {
    console.log("Creating customer:", from);
    customer = await this.customersService.create({
      name: `WhatsApp User ${from}`,
      whatsappId: from,
      phone: from,
      email: `${from}@whatsapp.local`,
    });
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

    // Trigger MPESA deposit prompt
    const draft = await this.bookingsService.getBookingDraft(customer.id);
    if (draft) {
      const amount = await this.bookingsService.getDepositForDraft(customer.id) || 2000; // fallback deposit
      const checkoutId = await this.paymentsService.initiateSTKPush(draft.id, newPhone, amount);

      // Send WhatsApp confirmation/prompt
      await this.messagesService.sendOutboundMessage(
        customer.id,
        `Deposit payment initiated. Please complete payment on your phone to confirm booking. 💰`,
        'whatsapp'
      );

      console.log(`STK Push initiated for ${newPhone}, CheckoutRequestID: ${checkoutId}`);
    }
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
