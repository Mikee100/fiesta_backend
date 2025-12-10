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
const messenger_send_service_1 = require("../webhooks/messenger-send.service");
const rxjs_1 = require("rxjs");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(prisma, httpService, messagesService, notificationsService, whatsappService, aiService, bookingsService, aiQueue, paymentsQueue, packagesService, messengerSendService) {
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
        this.messengerSendService = messengerSendService;
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
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(url, {
            headers: {
                Authorization: `Basic ${auth}`,
            },
        }));
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
        await this.prisma.payment.deleteMany({ where: { bookingDraftId } });
        const payment = await this.prisma.payment.create({
            data: {
                bookingDraftId,
                amount,
                phone: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
                status: 'pending',
            },
        });
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
            await this.paymentsQueue.add('timeoutPayment', { paymentId: payment.id }, {
                delay: 60000,
                removeOnComplete: true,
                removeOnFail: true,
            });
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
        }
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
                    userMessage = "It seems your payment failed because of a pending transaction on your phone. Please check your phone for any open M-Pesa prompts, cancel them if needed, and then reply 'resend' to try again. 📲";
                }
                else if (resultCode === 1032 || resultCode === '1032') {
                    userMessage = "You cancelled the payment request. No problem! If you'd like to try again, just reply 'resend' or 'yes' and I'll send a fresh payment prompt. 💖";
                }
                else if (resultCode === 1 || resultCode === '1') {
                    userMessage = "The balance was insufficient for the transaction. Please top up your M-PESA account and reply 'resend' to try again. 💰";
                }
                else if (resultCode === 1037 || resultCode === '1037') {
                    userMessage = "The payment request timed out. This can happen due to network issues. Reply 'resend' and I'll send you a fresh payment prompt. 📲";
                }
                else {
                    userMessage = `Payment failed: ${reason}. Reply 'resend' to try again, or contact us at 0720 111928 if the issue persists. 💖`;
                }
            }
            else {
                userMessage = `Payment failed: ${reason}. Reply 'resend' to try again, or contact us at 0720 111928 if the issue persists. 💖`;
            }
            const customer = await this.prisma.customer.findUnique({
                where: { id: payment.bookingDraft.customerId },
                select: { instagramId: true, whatsappId: true, messengerId: true }
            });
            if (customer?.whatsappId) {
                try {
                    await this.whatsappService.sendMessage(customer.whatsappId, userMessage);
                    await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'whatsapp');
                }
                catch (error) {
                    this.logger.error(`Failed to send payment failure message via WhatsApp: ${error.message}`);
                    await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'whatsapp');
                }
            }
            else if (customer?.messengerId) {
                try {
                    await this.messengerSendService.sendMessage(customer.messengerId, userMessage);
                    await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'messenger');
                }
                catch (error) {
                    this.logger.error(`Failed to send payment failure message via Messenger: ${error.message}`);
                    await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'messenger');
                }
            }
            else if (customer?.instagramId) {
                await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'instagram');
            }
            else {
                await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, userMessage, 'whatsapp');
            }
        }
    }
    async checkStuckPayments() {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const stuckPayments = await this.prisma.payment.findMany({
            where: {
                status: 'pending',
                createdAt: {
                    lt: tenMinutesAgo
                }
            },
            include: {
                bookingDraft: {
                    include: {
                        customer: true
                    }
                }
            }
        });
        for (const payment of stuckPayments) {
            this.logger.warn(`Found stuck payment ${payment.id}, created ${Math.floor((Date.now() - payment.createdAt.getTime()) / 1000 / 60)} minutes ago`);
            if (payment.bookingDraft) {
                const customer = payment.bookingDraft.customer;
                const platform = customer?.whatsappId ? 'whatsapp'
                    : customer?.instagramId ? 'instagram'
                        : customer?.messengerId ? 'messenger'
                            : 'whatsapp';
                const message = `I noticed your payment prompt has been pending for a while. Sometimes M-PESA confirmations can be delayed. If you completed the payment, please share your M-PESA receipt number. Otherwise, reply 'resend' and I'll send you a fresh payment prompt. 📲`;
                await this.messagesService.sendOutboundMessage(payment.bookingDraft.customerId, message, platform);
            }
        }
    }
    async queryTransactionStatus(checkoutRequestId) {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
            const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
            const queryUrl = `${this.mpesaBaseUrl}/mpesa/stkpushquery/v1/query`;
            const queryBody = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestId,
            };
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(queryUrl, queryBody, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }));
            const data = response.data;
            if (data.ResponseCode === '0' && data.ResultCode === '0') {
                let receipt = '';
                if (data.CallbackMetadata && data.CallbackMetadata.Item) {
                    const receiptItem = data.CallbackMetadata.Item.find((i) => i.Name === 'MpesaReceiptNumber');
                    if (receiptItem)
                        receipt = receiptItem.Value;
                }
                return { success: true, receipt };
            }
            else {
                return { success: false, error: data.ResultDesc || 'Transaction query failed' };
            }
        }
        catch (error) {
            this.logger.error(`Transaction status query failed for ${checkoutRequestId}:`, error);
            return { success: false, error: error.message || 'Query failed' };
        }
    }
    async verifyReceiptWithMpesaAPI(paymentId, receiptNumber) {
        try {
            const payment = await this.prisma.payment.findUnique({
                where: { id: paymentId },
                include: { bookingDraft: { include: { customer: true } } },
            });
            if (!payment || !payment.checkoutRequestId) {
                return { valid: false, matches: false, error: 'Payment not found or missing checkout ID' };
            }
            const queryResult = await this.queryTransactionStatus(payment.checkoutRequestId);
            if (!queryResult.success) {
                this.logger.warn(`[SECURITY] Transaction query failed for payment ${paymentId}: ${queryResult.error}`);
                return { valid: false, matches: false, error: queryResult.error };
            }
            if (queryResult.receipt) {
                if (queryResult.receipt.toUpperCase() !== receiptNumber.toUpperCase()) {
                    this.logger.warn(`[SECURITY] Receipt mismatch for payment ${paymentId}. Expected: ${queryResult.receipt}, Provided: ${receiptNumber}`);
                    return { valid: true, matches: false, error: 'Receipt number does not match M-Pesa records' };
                }
                return { valid: true, matches: true };
            }
            return { valid: true, matches: true };
        }
        catch (error) {
            this.logger.error(`[SECURITY] Receipt verification failed for payment ${paymentId}:`, error);
            return { valid: false, matches: false, error: error.message };
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
        bookings_service_1.BookingsService, Object, Object, packages_service_1.PackagesService,
        messenger_send_service_1.MessengerSendService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map