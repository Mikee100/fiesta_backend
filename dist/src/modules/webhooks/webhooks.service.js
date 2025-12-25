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
const messenger_send_service_1 = require("./messenger-send.service");
const notifications_service_1 = require("../notifications/notifications.service");
const luxon_1 = require("luxon");
let WebhooksService = class WebhooksService {
    constructor(messagesService, customersService, aiService, aiSettingsService, bookingsService, paymentsService, whatsappService, instagramService, messengerSendService, messageQueue, aiQueue, websocketGateway, notificationsService) {
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.aiService = aiService;
        this.aiSettingsService = aiSettingsService;
        this.bookingsService = bookingsService;
        this.paymentsService = paymentsService;
        this.whatsappService = whatsappService;
        this.instagramService = instagramService;
        this.messengerSendService = messengerSendService;
        this.messageQueue = messageQueue;
        this.aiQueue = aiQueue;
        this.websocketGateway = websocketGateway;
        this.notificationsService = notificationsService;
    }
    async handleWhatsAppWebhook(body) {
        if (body.object !== 'whatsapp_business_account') {
            console.log('[WEBHOOK] Ignoring webhook - wrong object type:', body.object);
            return { status: 'ignored' };
        }
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                if (value?.messages && value.messages.length > 0) {
                    console.log('[WEBHOOK] Processing WhatsApp message from webhook');
                    await this.processWhatsAppMessage(value);
                }
                else {
                    console.log('[WEBHOOK] No messages found in webhook payload');
                }
            }
        }
        return { status: 'ok' };
    }
    async processWhatsAppMessage(value) {
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
        }
        else {
            console.log("Creating customer:", from);
            customer = await this.customersService.create({
                name: `WhatsApp User ${from}`,
                whatsappId: from,
                phone: from,
                email: `${from}@whatsapp.local`,
            });
        }
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
        this.websocketGateway.emitNewMessage('whatsapp', {
            id: created.id,
            from,
            to: '',
            content: text,
            timestamp: created.createdAt.toISOString(),
            direction: 'inbound',
            customerId: customer.id,
        });
        const intent = await this.messagesService.classifyIntent(text);
        if (intent === 'reschedule') {
            const bookings = await this.bookingsService.getActiveBookings(customer.id);
            if (!bookings || bookings.length === 0) {
                await this.whatsappService.sendMessage(from, `I couldn't find an active booking for you. Would you like to start a new booking?`);
                return;
            }
            let booking = bookings[0];
            if (bookings.length > 1) {
                await this.whatsappService.sendMessage(from, `You have multiple active bookings. Please reply with the date or service of the booking you want to reschedule.`);
                await this.bookingsService.setAwaitingRescheduleSelection(customer.id, true);
                return;
            }
            const now = new Date();
            const bookingTime = new Date(booking.dateTime);
            const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (booking.status === 'completed' || booking.status === 'cancelled') {
                await this.whatsappService.sendMessage(from, `Your booking cannot be rescheduled as it is already completed or cancelled.`);
                return;
            }
            if (hoursDiff < 72) {
                const bookingDt = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
                if (this.notificationsService) {
                    await this.notificationsService.createNotification({
                        type: 'reschedule_request',
                        title: 'Reschedule Request - Within 72 Hours',
                        message: `Customer ${customer.name || customer.phone || from} requested to reschedule booking "${booking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
                        metadata: {
                            customerId: customer.id,
                            customerName: customer.name,
                            customerPhone: customer.phone || from,
                            bookingId: booking.id,
                            hoursUntilBooking: Math.round(hoursDiff),
                            originalDateTime: booking.dateTime,
                            platform: 'whatsapp',
                        },
                    });
                }
                await this.whatsappService.sendMessage(from, `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`);
                return;
            }
            const isAwaitingRescheduleTime = await this.bookingsService.isAwaitingRescheduleTime(booking.id);
            if (!isAwaitingRescheduleTime) {
                await this.whatsappService.sendMessage(from, `Sure! Please reply with your new preferred date and time for your booking (e.g. '12th Dec, 3pm').`);
                await this.bookingsService.setAwaitingRescheduleTime(booking.id, true);
                return;
            }
            else {
                const newTime = await this.aiService.extractDateTime(text);
                if (!newTime) {
                    await this.whatsappService.sendMessage(from, `Sorry, I couldn't understand the new date/time. Please reply with your preferred date and time (e.g. '12th Dec, 3pm').`);
                    return;
                }
                const conflict = await this.bookingsService.checkTimeConflict(newTime);
                if (conflict) {
                    await this.whatsappService.sendMessage(from, `That time is not available. Please choose another date and time.`);
                    return;
                }
                await this.bookingsService.updateBookingTime(booking.id, newTime);
                await this.bookingsService.setAwaitingRescheduleTime(booking.id, false);
                await this.whatsappService.sendMessage(from, `Your booking has been rescheduled to ${newTime}. If you need further changes, let us know!`);
                return;
            }
        }
        const phoneMatch = text.match(/0\d{9}/);
        if (phoneMatch) {
            const newPhone = phoneMatch[0];
            console.log(`User provided new phone number: ${newPhone}`);
            await this.customersService.updatePhone(from, newPhone);
            const draft = await this.bookingsService.getBookingDraft(customer.id);
            if (draft) {
                await this.bookingsService.updateBookingDraft(customer.id, { recipientPhone: newPhone });
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
                        console.log(`STK Push initiated for ${customerData.phone}, CheckoutRequestID: ${checkoutId.checkoutRequestId}`);
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
                try {
                    const queueClient = this.aiQueue.client;
                    if (queueClient) {
                    }
                    const queuePromise = this.aiQueue.add("handleAiJob", {
                        customerId: customer.id,
                        message: text,
                        platform: 'whatsapp'
                    });
                    queuePromise.catch((err) => {
                        console.log(`[WEBHOOK] Queue promise rejected (may be after timeout): ${err.message}`);
                    });
                    let timeoutId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error('Queue add timeout after 5 seconds')), 5000);
                    });
                    try {
                        const job = await Promise.race([queuePromise, timeoutPromise]);
                        clearTimeout(timeoutId);
                    }
                    catch (raceError) {
                        clearTimeout(timeoutId);
                        throw raceError;
                    }
                }
                catch (error) {
                    console.error('[WEBHOOK] ❌ Failed to queue message for AI processing:', error);
                    console.error('[WEBHOOK] Error details:', error instanceof Error ? error.message : String(error));
                    console.error('[WEBHOOK] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
                    try {
                        await this.whatsappService.sendMessage(from, "I'm having trouble processing your message right now. Please try again in a moment.");
                    }
                    catch (sendError) {
                        console.error('[WEBHOOK] Failed to send error message:', sendError);
                    }
                }
            }
            else {
                console.log(`[WEBHOOK] AI disabled - globalAiEnabled: ${globalAiEnabled}, customerAiEnabled: ${customerAiEnabled} - message not queued`);
            }
        }
    }
    async handleInstagramWebhook(data) {
        console.log('[WEBHOOK] Processing Instagram webhook:', JSON.stringify(data, null, 2));
        if (!data.entry || data.entry.length === 0) {
            console.log('[WEBHOOK] No entry in Instagram webhook payload');
            return;
        }
        const entry = data.entry[0];
        if (!entry.messaging || entry.messaging.length === 0) {
            console.log('[WEBHOOK] No messaging in Instagram webhook entry');
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
            console.log('[WEBHOOK] Received Instagram text message from', from, ':', text);
            try {
                let customer = await this.customersService.findByInstagramId(from);
                if (!customer) {
                    console.log('[WEBHOOK] Creating new customer for Instagram ID:', from);
                    customer = await this.customersService.create({
                        name: `Instagram User ${from}`,
                        email: `${from}@instagram.local`,
                        instagramId: from,
                    });
                }
                console.log('[WEBHOOK] Customer found/created:', customer.id);
                await this.customersService.updateLastInstagramMessageAt(from, new Date());
                console.log('[WEBHOOK] ✅ Updated lastInstagramMessageAt for 24-hour window tracking');
                const createdMessage = await this.messagesService.create({
                    content: text,
                    platform: 'instagram',
                    direction: 'inbound',
                    customerId: customer.id,
                });
                console.log('[WEBHOOK] Instagram message created in database:', createdMessage.id);
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
                        const bookingDt = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
                        if (this.notificationsService) {
                            await this.notificationsService.createNotification({
                                type: 'reschedule_request',
                                title: 'Reschedule Request - Within 72 Hours',
                                message: `Customer ${customer.name || customer.phone || from} requested to reschedule booking "${booking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
                                metadata: {
                                    customerId: customer.id,
                                    customerName: customer.name,
                                    customerPhone: customer.phone || from,
                                    bookingId: booking.id,
                                    hoursUntilBooking: Math.round(hoursDiff),
                                    originalDateTime: booking.dateTime,
                                    platform: 'instagram',
                                },
                            });
                        }
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
                console.log(`[WEBHOOK] [AI DEBUG] Instagram: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}, globalAiEnabled=${globalAiEnabled}`);
                if (globalAiEnabled && customerAiEnabled) {
                    console.log('[WEBHOOK] Adding Instagram message to centralized AI queue...');
                    await this.aiQueue.add('handleAiJob', {
                        customerId: customer.id,
                        message: text,
                        platform: 'instagram'
                    });
                    console.log('[WEBHOOK] Instagram message added to centralized AI queue successfully');
                }
                else {
                    console.log(`[WEBHOOK] AI disabled - globalAiEnabled=${globalAiEnabled}, customerAiEnabled=${customerAiEnabled} - Instagram message not queued`);
                }
            }
            catch (error) {
                console.error('[WEBHOOK] Error processing Instagram message:', error);
                console.error('[WEBHOOK] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
                throw error;
            }
        }
        else {
            console.log('[WEBHOOK] Instagram message is not a text message or missing text field');
        }
    }
    async verifyInstagramWebhook(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
            return challenge;
        }
        return 'ERROR';
    }
    async handleMessengerWebhook(data) {
        console.log('Processing Messenger webhook:', JSON.stringify(data, null, 2));
        if (!data.object || data.object !== 'page' || !Array.isArray(data.entry)) {
            console.log('No valid page object or entries in Messenger webhook payload');
            return;
        }
        for (const entry of data.entry) {
            if (!Array.isArray(entry.messaging))
                continue;
            for (const event of entry.messaging) {
                const senderId = event.sender?.id;
                const message = event.message;
                if (message?.is_echo) {
                    console.log('Ignoring echo message (sent by bot)');
                    continue;
                }
                if (!senderId || !message || !message.mid || !message.text) {
                    console.log("Ignoring non-text message or missing data");
                    continue;
                }
                const text = message.text;
                console.log('Received Messenger text message from', senderId, ':', text);
                let customer = await this.customersService.findByMessengerId(senderId);
                if (!customer) {
                    console.log('Creating new customer for Messenger ID:', senderId);
                    customer = await this.customersService.create({
                        name: `Messenger User ${senderId}`,
                        email: `${senderId}@messenger.local`,
                        messengerId: senderId,
                    });
                }
                console.log('Customer found/created:', customer.id);
                await this.customersService.updateLastMessengerMessageAt(senderId, new Date());
                console.log('✅ Updated lastMessengerMessageAt for 24-hour window tracking');
                const existing = await this.messagesService.findByExternalId(message.mid);
                if (existing) {
                    console.log("Duplicate inbound message ignored");
                    return;
                }
                const createdMessage = await this.messagesService.create({
                    content: text,
                    platform: 'messenger',
                    direction: 'inbound',
                    customerId: customer.id,
                    externalId: message.mid,
                });
                console.log('Messenger message created in database:', createdMessage.id);
                this.websocketGateway.emitNewMessage('messenger', {
                    id: createdMessage.id,
                    from: senderId,
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
                        await this.messengerSendService.sendMessage(senderId, `I couldn't find an active booking for you. Would you like to start a new booking?`);
                        return;
                    }
                    let booking = bookings[0];
                    if (bookings.length > 1) {
                        await this.messengerSendService.sendMessage(senderId, `You have multiple active bookings. Please reply with the date or service of the booking you want to reschedule.`);
                        await this.bookingsService.setAwaitingRescheduleSelection(customer.id, true);
                        return;
                    }
                    const now = new Date();
                    const bookingTime = new Date(booking.dateTime);
                    const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                    if (booking.status === 'completed' || booking.status === 'cancelled') {
                        await this.messengerSendService.sendMessage(senderId, `Your booking cannot be rescheduled as it is already completed or cancelled.`);
                        return;
                    }
                    if (hoursDiff < 72) {
                        const bookingDt = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
                        if (this.notificationsService) {
                            await this.notificationsService.createNotification({
                                type: 'reschedule_request',
                                title: 'Reschedule Request - Within 72 Hours',
                                message: `Customer ${customer.name || customer.phone || senderId} requested to reschedule booking "${booking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
                                metadata: {
                                    customerId: customer.id,
                                    customerName: customer.name,
                                    customerPhone: customer.phone || senderId,
                                    bookingId: booking.id,
                                    hoursUntilBooking: Math.round(hoursDiff),
                                    originalDateTime: booking.dateTime,
                                    platform: 'messenger',
                                },
                            });
                        }
                        await this.messengerSendService.sendMessage(senderId, `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`);
                        return;
                    }
                    const isAwaitingRescheduleTime = await this.bookingsService.isAwaitingRescheduleTime(booking.id);
                    if (!isAwaitingRescheduleTime) {
                        await this.messengerSendService.sendMessage(senderId, `Sure! Please reply with your new preferred date and time for your booking (e.g. '12th Dec, 3pm').`);
                        await this.bookingsService.setAwaitingRescheduleTime(booking.id, true);
                        return;
                    }
                    else {
                        const newTime = await this.aiService.extractDateTime(text);
                        if (!newTime) {
                            await this.messengerSendService.sendMessage(senderId, `Sorry, I couldn't understand the new date/time. Please reply with your preferred date and time (e.g. '12th Dec, 3pm').`);
                            return;
                        }
                        const conflict = await this.bookingsService.checkTimeConflict(newTime);
                        if (conflict) {
                            await this.messengerSendService.sendMessage(senderId, `That time is not available. Please choose another date and time.`);
                            return;
                        }
                        await this.bookingsService.updateBookingTime(booking.id, newTime);
                        await this.bookingsService.setAwaitingRescheduleTime(booking.id, false);
                        await this.messengerSendService.sendMessage(senderId, `Your booking has been rescheduled to ${newTime}. If you need further changes, let us know!`);
                        return;
                    }
                }
                const phoneMatch = text.match(/0\d{9}/);
                if (phoneMatch) {
                    const newPhone = phoneMatch[0];
                    console.log(`User provided new phone number: ${newPhone}`);
                    await this.customersService.updatePhoneByMessengerId(senderId, newPhone);
                    const draft = await this.bookingsService.getBookingDraft(customer.id);
                    if (draft) {
                        await this.bookingsService.updateBookingDraft(customer.id, { recipientPhone: newPhone });
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
                        await this.messengerSendService.sendMessage(senderId, confirmationMessage);
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
                                await this.messengerSendService.sendMessage(senderId, `Payment request sent! Please check your phone and enter your M-PESA PIN to complete the deposit payment. 💳✨`);
                                console.log(`STK Push initiated for ${customerData.phone}, CheckoutRequestID: ${checkoutId.checkoutRequestId}`);
                            }
                            catch (error) {
                                console.error('STK Push failed:', error);
                                await this.messengerSendService.sendMessage(senderId, `Sorry, there was an issue initiating payment. Please try again or contact us at ${process.env.CUSTOMER_CARE_PHONE || '0720 111928'}. 💖`);
                            }
                        }
                        else {
                            await this.messengerSendService.sendMessage(senderId, `I don't have your phone number yet. Please share it so I can send the payment request. 📱`);
                        }
                    }
                    else {
                        await this.messengerSendService.sendMessage(senderId, `I don't see a pending booking. Would you like to start a new booking? 💖`);
                    }
                }
                else if (text.toLowerCase() === 'cancel') {
                    await this.messengerSendService.sendMessage(senderId, `No problem! What would you like to change? You can:
• Choose a different package
• Pick a different date/time
• Start over

Just let me know! 💖`);
                }
                else {
                    const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
                    const customerAiEnabled = customer.aiEnabled ?? true;
                    if (globalAiEnabled && customerAiEnabled) {
                        console.log("Queueing Messenger message for centralized AI...");
                        await this.aiQueue.add("handleAiJob", {
                            customerId: customer.id,
                            message: text,
                            platform: 'messenger'
                        });
                    }
                    else {
                        console.log('AI disabled (global or customer-specific) - Messenger message not queued');
                    }
                }
            }
        }
        return { status: 'ok' };
    }
    async testQueueConnection(body) {
        const { customerId, message, platform } = body;
        console.log('[TEST] Testing queue connection...');
        try {
            if (!this.aiQueue) {
                return { success: false, error: 'aiQueue is not initialized' };
            }
            const queueClient = this.aiQueue.client;
            let redisStatus = 'unknown';
            if (queueClient) {
                redisStatus = queueClient.status || 'unknown';
                console.log(`[TEST] Redis client status: ${redisStatus}`);
            }
            console.log(`[TEST] Adding test job to queue...`);
            const job = await this.aiQueue.add("handleAiJob", {
                customerId,
                message,
                platform: platform || 'whatsapp'
            });
            console.log(`[TEST] ✅ Job added successfully! Job ID: ${job.id}`);
            return {
                success: true,
                jobId: job.id,
                redisStatus,
                message: 'Job queued successfully. Check logs for processing status.'
            };
        }
        catch (error) {
            console.error('[TEST] ❌ Queue test failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            };
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
    __param(9, (0, bull_1.InjectQueue)('messageQueue')),
    __param(10, (0, bull_1.InjectQueue)('aiQueue')),
    __metadata("design:paramtypes", [messages_service_1.MessagesService,
        customers_service_1.CustomersService,
        ai_service_1.AiService,
        ai_settings_service_1.AiSettingsService,
        bookings_service_1.BookingsService,
        payments_service_1.PaymentsService,
        whatsapp_service_1.WhatsappService,
        instagram_service_1.InstagramService,
        messenger_send_service_1.MessengerSendService, Object, Object, websocket_gateway_1.WebsocketGateway,
        notifications_service_1.NotificationsService])
], WebhooksService);
//# sourceMappingURL=webhooks.service.js.map