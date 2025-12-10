import { HttpService } from '@nestjs/axios';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PackagesService } from '../packages/packages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessengerSendService } from '../webhooks/messenger-send.service';
export declare class PaymentsService {
    private prisma;
    private httpService;
    private messagesService;
    private notificationsService;
    private whatsappService;
    private aiService;
    private bookingsService;
    private aiQueue;
    private paymentsQueue;
    private packagesService;
    private messengerSendService;
    private readonly logger;
    private readonly mpesaBaseUrl;
    private readonly consumerKey;
    private readonly consumerSecret;
    private readonly shortcode;
    private readonly passkey;
    private readonly callbackUrl;
    constructor(prisma: PrismaService, httpService: HttpService, messagesService: MessagesService, notificationsService: NotificationsService, whatsappService: WhatsappService, aiService: AiService, bookingsService: BookingsService, aiQueue: Queue, paymentsQueue: Queue, packagesService: PackagesService, messengerSendService: MessengerSendService);
    getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        phone: string;
        bookingId: string | null;
        bookingDraftId: string | null;
        amount: number;
        mpesaReceipt: string | null;
        checkoutRequestId: string | null;
    }>;
    getAccessToken(): Promise<string>;
    initiateSTKPush(bookingDraftId: string, phone: string, amount: number): Promise<{
        checkoutRequestId: string;
        paymentId: string;
    }>;
    handleCallback(body: any): Promise<void>;
    handlePaymentWebhook(checkoutRequestId: string, status: string): Promise<void>;
    private confirmPayment;
    handlePaymentFailure(payment: any, reason: string, resultCode?: number | string): Promise<void>;
    checkStuckPayments(): Promise<void>;
    queryTransactionStatus(checkoutRequestId: string): Promise<{
        success: boolean;
        receipt?: string;
        error?: string;
    }>;
    verifyReceiptWithMpesaAPI(paymentId: string, receiptNumber: string): Promise<{
        valid: boolean;
        matches: boolean;
        error?: string;
    }>;
    testStkPush(phone: string, amount: number): Promise<{
        checkoutRequestId: any;
        merchantRequestId: any;
    }>;
}
