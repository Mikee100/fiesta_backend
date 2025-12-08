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
exports.WebhooksService = void 0;
const common_1 = require("@nestjs/common");
const messages_service_1 = require("../messages/messages.service");
const customers_service_1 = require("../customers/customers.service");
const ai_service_1 = require("../ai/ai.service");
const ai_settings_service_1 = require("../ai/ai-settings.service");
const bull_1 = require("@nestjs/bull");
const websocket_gateway_1 = require("../../websockets/websocket.gateway");
const bookings_service_1 = require("../bookings/bookings.service");
const payments_service_1 = require("../payments/payments.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const instagram_service_1 = require("../instagram/instagram.service");
let WebhooksService = class WebhooksService {
    constructor(messagesService, customersService, aiService, aiSettingsService, bookingsService, paymentsService, whatsappService, instagramService, messageQueue, websocketGateway) {
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.aiService = aiService;
        this.aiSettingsService = aiSettingsService;
        this.bookingsService = bookingsService;
        this.paymentsService = paymentsService;
        this.whatsappService = whatsappService;
        this.instagramService = instagramService;
        this.messageQueue = messageQueue;
        this.websocketGateway = websocketGateway;
    }
    async handleWhatsAppWebhook(body) {
        if (body.object !== 'whatsapp_business_account') {
            return { status: 'ignored' };
        }
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                if (value?.messages && value.messages.length > 0) {
                    await this.processWhatsAppMessage(value);
                }
            }
        }
        return { status: 'ok' };
    }
    async processWhatsAppMessage(value) {
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
        if (message.type === 'system' || message.from === 'whatsapp_bot' || message.is_echo) {
            console.log('Ignoring echo/bot message (sent by bot)');
            return;
        }
        console.log('Message type:', message.type, 'ID:', message.id);
        if (!text) {
            console.log("Ignoring non-text message");
            return;
        }
        let customer = await this.customersService.findByWhatsappId(from);
        if (customer) {
            console.log(`[AI DEBUG] WhatsApp: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}`);
        }
        else {
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
        const existing = await this.messagesService.findByExternalId(messageId);
        if (existing) {
            console.log("Duplicate inbound message ignored");
            return;
        }
        const created = await this.messagesService.create({
            content: text,
            platform: 'whatsapp',
            direction: 'inbound',
            customerId: customer.id,
            externalId: messageId,
        });
        console.log("Message saved:", created.id);
        this.websocketGateway.emitNewMessage('whatsapp', {
            id: created.id,
            from,
            to: '',
            content: text,
            timestamp: created.createdAt.toISOString(),
            direction: 'inbound',
            customerId: customer.id,
        });
        const phoneMatch = text.match(/0\d{9}/);
        if (phoneMatch) {
            const newPhone = phoneMatch[0];
            console.log(`User provided new phone number: ${newPhone}`);
            await this.customersService.updatePhone(from, newPhone);
            const draft = await this.bookingsService.getBookingDraft(customer.id);
            if (draft) {
                const depositAmount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;
                const packages = await this.aiService.getCachedPackages();
                const selectedPackage = packages.find(p => p.name === draft.service);
                const fullPrice = selectedPackage?.price || 0;
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
                await this.whatsappService.sendMessage(from, confirmationMessage);
                console.log(`Deposit confirmation sent to ${newPhone}. Waiting for user confirmation.`);
            }
        }
        else if (text.toLowerCase() === 'confirm') {
            const draft = await this.bookingsService.getBookingDraft(customer.id);
            if (draft) {
                const customerData = await this.customersService.findOne(customer.id);
                if (customerData?.phone) {
                    const amount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;
                    try {
                        const checkoutId = await this.paymentsService.initiateSTKPush(draft.id, customerData.phone, amount);
                        await this.whatsappService.sendMessage(from, `Payment request sent! Please check your phone and enter your M-PESA PIN to complete the deposit payment. 💳✨`);
                        console.log(`STK Push initiated for ${customerData.phone}, CheckoutRequestID: ${checkoutId}`);
                    }
                    catch (error) {
                        console.error('STK Push failed:', error);
                        await this.whatsappService.sendMessage(from, `Sorry, there was an issue initiating payment. Please try again or contact us at ${process.env.CUSTOMER_CARE_PHONE || '0720 111928'}. 💖`);
                    }
                }
                else {
                    await this.whatsappService.sendMessage(from, `I don't have your phone number yet. Please share it so I can send the payment request. 📱`);
                }
            }
            else {
                await this.whatsappService.sendMessage(from, `I don't see a pending booking. Would you like to start a new booking? 💖`);
            }
        }
        else if (text.toLowerCase() === 'cancel') {
            await this.whatsappService.sendMessage(from, `No problem! What would you like to change? You can:
• Choose a different package
• Pick a different date/time
• Start over

Just let me know! 💖`);
        }
        else {
            const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
            const customerAiEnabled = customer.aiEnabled ?? true;
            if (globalAiEnabled && customerAiEnabled) {
                console.log("Queueing message for AI...");
                await this.messageQueue.add("processMessage", { messageId: created.id });
            }
            else {
                console.log('AI disabled (global or customer-specific) - message not queued');
            }
        }
    }
    async handleInstagramWebhook(data) {
        console.log('Processing Instagram webhook:', JSON.stringify(data, null, 2));
        if (!data.entry || data.entry.length === 0) {
            console.log('No entry in Instagram webhook payload');
            return;
        }
        const entry = data.entry[0];
        if (!entry.messaging || entry.messaging.length === 0) {
            console.log('No messaging in Instagram webhook entry');
            return;
        }
        const message = entry.messaging[0];
        console.log('Instagram message type:', message.message?.text ? 'text' : 'other');
        if (message.message?.is_echo) {
            console.log('Ignoring echo message (sent by bot)');
            return;
        }
        if (message.message?.text) {
            const from = message.sender.id;
            const text = message.message.text;
            console.log('Received Instagram text message from', from, ':', text);
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
            await this.customersService.updateLastInstagramMessageAt(from, new Date());
            console.log('✅ Updated lastInstagramMessageAt for 24-hour window tracking');
            const createdMessage = await this.messagesService.create({
                content: text,
                platform: 'instagram',
                direction: 'inbound',
                customerId: customer.id,
            });
            console.log('Instagram message created in database:', createdMessage.id);
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
            const intent = await this.messagesService.classifyIntent(text);
            if (intent === 'reschedule') {
                const bookings = await this.bookingsService.getActiveBookings(customer.id);
                if (!bookings || bookings.length === 0) {
                    await this.instagramService.sendMessage(from, `I couldn’t find an active booking for you. Would you like to start a new booking?`);
                    return;
                }
                let booking = bookings[0];
                if (bookings.length > 1) {
                    await this.instagramService.sendMessage(from, `You have multiple active bookings. Please reply with the date or service of the booking you want to reschedule.`);
                    await this.bookingsService.setAwaitingRescheduleSelection(customer.id, true);
                    return;
                }
                const now = new Date();
                const bookingTime = new Date(booking.dateTime);
                const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                if (booking.status === 'completed' || booking.status === 'cancelled') {
                    await this.instagramService.sendMessage(from, `Your booking cannot be rescheduled as it is already completed or cancelled.`);
                    return;
                }
                if (hoursDiff < 72) {
                    await this.instagramService.sendMessage(from, `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`);
                    return;
                }
                const isAwaitingRescheduleTime = await this.bookingsService.isAwaitingRescheduleTime(booking.id);
                if (!isAwaitingRescheduleTime) {
                    await this.instagramService.sendMessage(from, `Sure! Please reply with your new preferred date and time for your booking (e.g. '12th Dec, 3pm').`);
                    await this.bookingsService.setAwaitingRescheduleTime(booking.id, true);
                    return;
                }
                else {
                    const newTime = await this.aiService.extractDateTime(text);
                    if (!newTime) {
                        await this.instagramService.sendMessage(from, `Sorry, I couldn’t understand the new date/time. Please reply with your preferred date and time (e.g. '12th Dec, 3pm').`);
                        return;
                    }
                    const conflict = await this.bookingsService.checkTimeConflict(newTime);
                    if (conflict) {
                        await this.instagramService.sendMessage(from, `That time is not available. Please choose another date and time.`);
                        return;
                    }
                    await this.bookingsService.updateBookingTime(booking.id, newTime);
                    await this.bookingsService.setAwaitingRescheduleTime(booking.id, false);
                    await this.instagramService.sendMessage(from, `Your booking has been rescheduled to ${newTime}. If you need further changes, let us know!`);
                    return;
                }
            }
            const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
            const customerAiEnabled = customer.aiEnabled;
            console.log(`[AI DEBUG] Instagram: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}`);
            if (globalAiEnabled && customerAiEnabled) {
                console.log('Adding Instagram message to queue for processing...');
                await this.messageQueue.add('processMessage', {
                    messageId: createdMessage.id,
                });
                console.log('Instagram message added to queue successfully');
            }
            else {
                console.log('AI disabled (global or customer-specific) - Instagram message not queued');
            }
        }
    }
    async verifyInstagramWebhook(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
            return challenge;
        }
        return 'ERROR';
    }
    async handleMessengerWebhook(data) {
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
    async handleTelegramWebhook(data) {
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
};
exports.WebhooksService = WebhooksService;
exports.WebhooksService = WebhooksService = __decorate([
    (0, common_1.Injectable)(),
    __param(8, (0, bull_1.InjectQueue)('messageQueue')),
    __metadata("design:paramtypes", [messages_service_1.MessagesService,
        customers_service_1.CustomersService,
        ai_service_1.AiService,
        ai_settings_service_1.AiSettingsService,
        bookings_service_1.BookingsService,
        payments_service_1.PaymentsService,
        whatsapp_service_1.WhatsappService,
        instagram_service_1.InstagramService, Object, websocket_gateway_1.WebsocketGateway])
], WebhooksService);
//# sourceMappingURL=webhooks.service.js.map