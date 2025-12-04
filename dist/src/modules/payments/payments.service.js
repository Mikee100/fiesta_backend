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
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../prisma/prisma.service");
const messages_service_1 = require("../messages/messages.service");
const luxon_1 = require("luxon");
const ai_service_1 = require("../ai/ai.service");
const bookings_service_1 = require("../bookings/bookings.service");
const notifications_service_1 = require("../notifications/notifications.service");
const packages_service_1 = require("../packages/packages.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const rxjs_1 = require("rxjs");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(prisma, httpService, messagesService, notificationsService, whatsappService, aiService, bookingsService, aiQueue, paymentsQueue, packagesService) {
        this.prisma = prisma;
        this.httpService = httpService;
        this.messagesService = messagesService;
        this.notificationsService = notificationsService;
        this.whatsappService = whatsappService;
        this.aiService = aiService;
        this.bookingsService = bookingsService;
        this.aiQueue = aiQueue;
        this.paymentsQueue = paymentsQueue;
        this.packagesService = packagesService;
        this.logger = new common_1.Logger(PaymentsService_1.name);
        this.mpesaBaseUrl = 'https://sandbox.safaricom.co.ke';
        this.consumerKey = process.env.MPESA_CONSUMER_KEY;
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        this.shortcode = process.env.MPESA_SHORTCODE;
        this.passkey = process.env.MPESA_PASSKEY;
        this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    }
    async getPaymentByCheckoutRequestId(checkoutRequestId) {
        return this.prisma.payment.findFirst({
            where: { checkoutRequestId },
        });
    }
    async getAccessToken() {
        if (!this.consumerKey || !this.consumerSecret) {
            throw new Error('MPesa credentials not configured.');
        }
        const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
        const url = `${this.mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`;
        this.logger.log(`Getting access token from: ${url}`);
        this.logger.log(`Authorization header: Basic ${auth.substring(0, 10)}...`);
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(url, {
            headers: {
                Authorization: `Basic ${auth}`,
            },
        }));
        this.logger.log(`Access token response data: ${JSON.stringify(response.data)}`);
        if (!response.data || !response.data.access_token) {
            throw new Error(`Invalid access token response: ${JSON.stringify(response.data)}`);
        }
        return response.data.access_token;
    }
    async initiateSTKPush(bookingDraftId, phone, amount) {
        const draft = await this.prisma.bookingDraft.findUnique({
            where: { id: bookingDraftId },
            include: { customer: true },
        });
        if (!draft || !draft.service) {
            throw new Error('No valid booking draft found');
        }
        const packageInfo = await this.packagesService.findPackageByName(draft.service);
        if (!packageInfo) {
            throw new Error('Package not found');
        }
        const existingPayment = await this.prisma.payment.findFirst({
            where: { bookingDraftId },
        });
        let payment;
        if (existingPayment) {
            if (existingPayment.status === 'success') {
                throw new Error('Payment already completed for this booking draft');
            }
            if (existingPayment.status === 'pending' && existingPayment.checkoutRequestId) {
                const now = new Date();
                const paymentTime = new Date(existingPayment.updatedAt);
                const diffMs = now.getTime() - paymentTime.getTime();
                if (diffMs > 60000) {
                    this.logger.warn(`Found stale pending payment ${existingPayment.id} (> 1 min), marking as failed`);
                    await this.prisma.payment.update({
                        where: { id: existingPayment.id },
                        data: { status: 'failed' },
                    });
                    existingPayment.status = 'failed';
                }
                else {
                    this.logger.log(`Reusing existing pending payment ${existingPayment.id}, CheckoutRequestID: ${existingPayment.checkoutRequestId}`);
                    return { checkoutRequestId: existingPayment.checkoutRequestId, paymentId: existingPayment.id };
                }
            }
            if (existingPayment.status === 'failed' || (existingPayment.status === 'pending' && !existingPayment.checkoutRequestId)) {
                payment = await this.prisma.payment.update({
                    where: { id: existingPayment.id },
                    data: {
                        status: 'pending',
                        checkoutRequestId: null,
                        amount,
                        phone: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
                    },
                });
                this.logger.log(`Reset old payment ${existingPayment.id} for draft ${bookingDraftId}`);
            }
            else {
                payment = existingPayment;
            }
        }
        else {
            payment = await this.prisma.payment.create({
                data: {
                    bookingDraftId,
                    amount,
                    phone: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
                    status: 'pending',
                },
            });
        }
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
        const accessToken = await this.getAccessToken();
        const stkRequestBody = {
            BusinessShortCode: this.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: amount,
            PartyA: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
            PartyB: this.shortcode,
            PhoneNumber: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
            CallBackURL: this.callbackUrl,
            AccountReference: 'Fiesta House',
            TransactionDesc: `Deposit for ${draft.service} booking`,
        };
        const stkUrl = `${this.mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`;
        this.logger.log(`Initiating STK Push to URL: ${stkUrl}`);
        this.logger.log(`STK Push request body: ${JSON.stringify(stkRequestBody)}`);
        this.logger.log(`Authorization header: Bearer ${accessToken.substring(0, 10)}...`);
        try {
            const stkResponse = await (0, rxjs_1.firstValueFrom)(this.httpService.post(stkUrl, stkRequestBody, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }));
            const data = stkResponse.data;
            if (data.ResponseCode !== '0') {
                await this.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'failed' },
                });
                throw new Error(`STK Push failed: ${data.errorMessage}`);
            }
            await this.prisma.payment.update({
                where: { id: payment.id },
                data: { checkoutRequestId: data.CheckoutRequestID },
            });
            this.logger.log(`STK Push initiated for payment ${payment.id}, CheckoutRequestID: ${data.CheckoutRequestID}`);
            await this.paymentsQueue.add('timeoutPayment', { paymentId: payment.id }, {
                delay: 60000,
                removeOnComplete: true,
                removeOnFail: true,
            });
            this.logger.log(`Scheduled timeout for payment ${payment.id} in 60s`);
            return { checkoutRequestId: data.CheckoutRequestID, paymentId: payment.id };
        }
        catch (error) {
            this.logger.error(`STK Push request failed: ${error.message}`, error.response?.data || error);
            await this.prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'failed' },
            });
            throw error;
        }
    }
    async handleCallback(body) {
        const { Body } = body;
        const { stkCallback } = Body;
        const { CheckoutRequestID } = stkCallback;
        const { ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
        const payment = await this.prisma.payment.findFirst({
            where: { checkoutRequestId: CheckoutRequestID },
            include: { bookingDraft: { include: { customer: true } } },
        });
        if (!payment) {
            this.logger.warn(`Payment not found for CheckoutRequestID: ${CheckoutRequestID}`);
            return;
        }
        if (ResultCode === 0 || ResultCode === '0') {
            let receipt = '';
            if (CallbackMetadata && CallbackMetadata.Item) {
                const item = CallbackMetadata.Item.find((i) => i.Name === 'MpesaReceiptNumber');
                if (item)
                    receipt = item.Value;
            }
            await this.confirmPayment(payment, receipt);
        }
        else {
            await this.handlePaymentFailure(payment, ResultDesc, ResultCode);
        }
    }
    async handlePaymentWebhook(checkoutRequestId, status) {
        const payment = await this.prisma.payment.findFirst({
            where: { checkoutRequestId },
            include: { bookingDraft: { include: { customer: true } } },
        });
        if (!payment) {
            this.logger.warn(`Payment not found for webhook CheckoutRequestID: ${checkoutRequestId}`);
            return;
        }
        if (status === 'success') {
            await this.confirmPayment(payment, 'ConfirmedViaWebhook');
        }
        else {
            await this.handlePaymentFailure(payment, 'Failed via webhook update');
        }
    }
    async confirmPayment(payment, receipt) {
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'success',
                mpesaReceipt: receipt,
            },
        });
        if (payment.bookingDraft) {
            this.logger.log(`Payment successful for booking draft ${payment.bookingDraft.id}, confirming booking`);
            const draft = payment.bookingDraft;
            const booking = await this.prisma.booking.create({
                data: {
                    customerId: draft.customerId,
                    service: draft.service,
                    dateTime: new Date(draft.dateTimeIso),
                    status: 'confirmed',
                    recipientName: draft.recipientName || draft.customer.name,
                    recipientPhone: draft.recipientPhone || draft.customer.phone,
                },
                include: { customer: true },
            });
            await this.prisma.bookingDraft.delete({
                where: { id: draft.id },
            });
            const bookingDate = luxon_1.DateTime.fromJSDate(booking.dateTime);
            const scheduledReminders = [];
            const reminderConfigs = [
                { days: 2, label: '2' },
                { days: 1, label: '1' },
            ];
            for (const { days, label } of reminderConfigs) {
                const reminderTime = bookingDate.minus({ days });
                const delay = reminderTime.diffNow().as('milliseconds');
                if (delay > 0) {
                    scheduledReminders.push({ days, dateTime: reminderTime });
                }
            }
            const confirmationMessage = await this.bookingsService.formatBookingConfirmationMessage(booking, receipt, scheduledReminders);
            if (draft.customer?.whatsappId) {
                await this.whatsappService.sendMessage(draft.customer.whatsappId, confirmationMessage);
                this.logger.log(`Booking confirmation sent to WhatsApp: ${draft.customer.whatsappId}`);
            }
            else {
                this.logger.warn(`No WhatsApp ID found for customer ${draft.customerId}, confirmation not sent`);
            }
            for (const { days, dateTime } of scheduledReminders) {
                const delay = dateTime.diffNow().as('milliseconds');
                await this.aiQueue.add('sendReminder', {
                    customerId: draft.customerId,
                    bookingId: booking.id,
                    date: draft.date,
                    time: draft.time,
                    recipientName: draft.recipientName || draft.name,
                    daysBefore: days.toString(),
                }, {
                    delay,
                    removeOnComplete: true,
                    removeOnFail: true,
                });
                this.logger.log(`Reminder scheduled for: ${dateTime.toISO()} (${days} days before)`);
            }
            try {
                await this.notificationsService.createNotification({
                    type: 'payment',
                    title: `Payment Received - KSH ${payment.amount}`,
                    message: `Deposit of KSH ${payment.amount.toLocaleString()} received from ${draft.customer.name || 'Customer'} (Receipt: ${receipt})`,
                    metadata: {
                        amount: payment.amount,
                        receipt: receipt,
                        customerName: draft.customer.name,
                        customerId: draft.customerId,
                        bookingId: booking.id,
                    },
                });
                const bookingDateTime = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
                await this.notificationsService.createNotification({
                    type: 'booking',
                    title: `New Booking - ${draft.service}`,
                    message: `${draft.customer.name || 'Customer'} booked ${draft.service} on ${bookingDateTime.toFormat('LLL dd, yyyy')} at ${bookingDateTime.toFormat('h:mm a')}`,
                    metadata: {
                        bookingId: booking.id,
                        customerId: draft.customerId,
                        customerName: draft.customer.name,
                        service: draft.service,
                        dateTime: booking.dateTime.toISOString(),
                        recipientName: draft.recipientName,
                        recipientPhone: draft.recipientPhone,
                    },
                });
            }
            catch (notifError) {
                this.logger.error(`Failed to create notifications for booking ${booking.id}`, notifError);
            }
            this.logger.log(`Booking ${booking.id} confirmed from draft ${draft.id}`);
        }
        this.logger.log(`Payment ${payment.id} confirmed: ${receipt}`);
    }
    async handlePaymentFailure(payment, reason, resultCode) {
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'failed' },
        });
        this.logger.error(`Payment failed for ${payment.id}: ${reason}`);
        if (payment.bookingDraft) {
            let userMessage = "We couldn't process your payment. Please try again.";
            if (resultCode) {
                if (resultCode === 11 || resultCode === '11') {
                    userMessage = "It seems your payment failed because of a pending transaction on your phone. Please check your phone for any open M-Pesa prompts, cancel them if needed, and then try again. 📲";
                }
                else if (resultCode === 1032 || resultCode === '1032') {
                    userMessage = "You cancelled the payment request. If this was a mistake, you can try again anytime! 💖";
                }
                else if (resultCode === 1 || resultCode === '1') {
                    userMessage = "The balance was insufficient for the transaction. Please top up and try again. 💰";
                }
                else {
                    userMessage = `Payment failed: ${reason}. Please try again.`;
                }
            }
            else {
                userMessage = `Payment failed: ${reason}. Please try again.`;
            }
            await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'whatsapp');
        }
    }
    async testStkPush(phone, amount) {
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
        const accessToken = await this.getAccessToken();
        const stkRequestBody = {
            BusinessShortCode: this.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: amount,
            PartyA: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
            PartyB: this.shortcode,
            PhoneNumber: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
            CallBackURL: this.callbackUrl,
            AccountReference: `TestSTKPush`,
            TransactionDesc: `Test STK Push`,
        };
        const stkUrl = `${this.mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`;
        this.logger.log(`[TEST] Initiating STK Push to URL: ${stkUrl}`);
        this.logger.log(`[TEST] STK Push request body: ${JSON.stringify(stkRequestBody)}`);
        this.logger.log(`[TEST] Authorization header: Bearer ${accessToken.substring(0, 10)}...`);
        try {
            const stkResponse = await (0, rxjs_1.firstValueFrom)(this.httpService.post(stkUrl, stkRequestBody, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }));
            const data = stkResponse.data;
            if (data.ResponseCode !== '0') {
                throw new Error(`STK Push failed: ${data.errorMessage}`);
            }
            this.logger.log(`[TEST] STK Push initiated, CheckoutRequestID: ${data.CheckoutRequestID}`);
            return { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID };
        }
        catch (error) {
            this.logger.error(`[TEST] STK Push request failed: ${error.message}`, error.response?.data || error);
            throw error;
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => ai_service_1.AiService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => bookings_service_1.BookingsService))),
    __param(7, (0, bull_1.InjectQueue)('aiQueue')),
    __param(8, (0, bull_1.InjectQueue)('paymentsQueue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        axios_1.HttpService,
        messages_service_1.MessagesService,
        notifications_service_1.NotificationsService,
        whatsapp_service_1.WhatsappService,
        ai_service_1.AiService,
        bookings_service_1.BookingsService, Object, Object, packages_service_1.PackagesService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map