import { HttpService } from '@nestjs/axios';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';
export declare class PaymentsService {
    private prisma;
    private httpService;
    private messagesService;
    private aiService;
    private aiQueue;
    private readonly logger;
    private readonly mpesaBaseUrl;
    private readonly consumerKey;
    private readonly consumerSecret;
    private readonly shortcode;
    private readonly passkey;
    private readonly callbackUrl;
    constructor(prisma: PrismaService, httpService: HttpService, messagesService: MessagesService, aiService: AiService, aiQueue: Queue);
    getPaymentByCheckoutRequestId(checkoutRequestId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        bookingDraftId: string | null;
        amount: number;
        phone: string;
        status: string;
        mpesaReceipt: string | null;
        checkoutRequestId: string | null;
    }>;
    getAccessToken(): Promise<string>;
    initiateSTKPush(bookingDraftId: string, phone: string, amount: number): Promise<string>;
    handleCallback(body: any): Promise<void>;
    testStkPush(phone: string, amount: number): Promise<{
        checkoutRequestId: any;
        merchantRequestId: any;
    }>;
}
