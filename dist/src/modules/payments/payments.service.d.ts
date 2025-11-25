import { HttpService } from '@nestjs/axios';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
export declare class PaymentsService {
    private prisma;
    private httpService;
    private messagesService;
    private aiQueue;
    private readonly logger;
    private readonly mpesaBaseUrl;
    private readonly consumerKey;
    private readonly consumerSecret;
    private readonly shortcode;
    private readonly passkey;
    private readonly callbackUrl;
    constructor(prisma: PrismaService, httpService: HttpService, messagesService: MessagesService, aiQueue: Queue);
    getAccessToken(): Promise<string>;
    initiateSTKPush(bookingDraftId: string, phone: string, amount: number): Promise<string>;
    handleCallback(body: any): Promise<void>;
}
