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
const rxjs_1 = require("rxjs");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(prisma, httpService, messagesService, aiQueue) {
        this.prisma = prisma;
        this.httpService = httpService;
        this.messagesService = messagesService;
        this.aiQueue = aiQueue;
        this.logger = new common_1.Logger(PaymentsService_1.name);
        this.mpesaBaseUrl = 'https://sandbox.safaricom.co.ke';
        this.consumerKey = process.env.MPESA_CONSUMER_KEY;
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        this.shortcode = process.env.MPESA_SHORTCODE;
        this.passkey = process.env.MPESA_PASSKEY;
        this.callbackUrl = process.env.MPESA_CALLBACK_URL;
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
        const packageInfo = await this.prisma.package.findFirst({ where: { name: draft.service } });
        if (!packageInfo) {
            throw new Error('Package not found');
        }
        const existingPayment = await this.prisma.payment.findFirst({
            where: { bookingDraftId },
        });
        if (existingPayment) {
            if (existingPayment.status === 'success') {
                throw new Error('Payment already completed for this booking draft');
            }
            if (existingPayment.status === 'pending' && existingPayment.checkoutRequestId) {
                this.logger.log(`Reusing existing pending payment ${existingPayment.id}, CheckoutRequestID: ${existingPayment.checkoutRequestId}`);
                return existingPayment.checkoutRequestId;
            }
            if (existingPayment.status === 'failed' || (existingPayment.status === 'pending' && !existingPayment.checkoutRequestId)) {
                await this.prisma.payment.delete({
                    where: { id: existingPayment.id },
                });
                this.logger.log(`Deleted old payment ${existingPayment.id} for draft ${bookingDraftId}`);
            }
        }
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
            CallBackURL: `${this.callbackUrl}/validation`,
            AccountReference: `BookingDeposit-${draft.id}`,
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
            return data.CheckoutRequestID;
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
        if (ResultCode === '0') {
            let receipt = '';
            if (CallbackMetadata && CallbackMetadata.Item) {
                const item = CallbackMetadata.Item.find((i) => i.Name === 'MpesaReceiptNumber');
                if (item)
                    receipt = item.Value;
            }
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
                    },
                });
                await this.prisma.bookingDraft.delete({
                    where: { id: draft.id },
                });
                await this.messagesService.sendOutboundMessage(draft.customerId, "Payment successful! Your maternity photoshoot booking is now confirmed. We'll send you a reminder closer to the date. 💖", 'whatsapp');
                const bookingDate = luxon_1.DateTime.fromJSDate(booking.dateTime);
                const reminderTime = bookingDate.minus({ days: 2 });
                await this.aiQueue.add('sendReminder', {
                    customerId: draft.customerId,
                    bookingId: booking.id,
                    date: draft.date,
                    time: draft.time,
                    recipientName: draft.recipientName || draft.name,
                }, {
                    delay: reminderTime.diffNow().as('milliseconds'),
                    removeOnComplete: true,
                    removeOnFail: true,
                });
                this.logger.log(`Reminder scheduled for: ${reminderTime.toISO()}`);
                this.logger.log(`Booking ${booking.id} confirmed from draft ${draft.id}`);
            }
            this.logger.log(`Payment ${payment.id} confirmed: ${receipt}`);
        }
        else {
            await this.prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'failed' },
            });
            this.logger.error(`STK Push failed for ${payment.id}: ${ResultDesc}`);
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, bull_1.InjectQueue)('aiQueue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        axios_1.HttpService,
        messages_service_1.MessagesService, Object])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map