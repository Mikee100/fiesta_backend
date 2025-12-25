import { ConfigService } from '@nestjs/config';
import { CustomersService } from '../customers/customers.service';
import { MessagesService } from '../messages/messages.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
export declare class MessengerService {
    private readonly configService;
    private readonly customersService;
    private readonly messagesService;
    private readonly websocketGateway;
    private readonly aiQueue;
    private readonly prisma;
    private readonly logger;
    private readonly fbVerifyToken;
    constructor(configService: ConfigService, customersService: CustomersService, messagesService: MessagesService, websocketGateway: WebsocketGateway, aiQueue: Queue, prisma: PrismaService);
    verifyWebhook(mode: string, token: string, challenge: string): string | null;
    handleMessage(body: any): Promise<void>;
    getMessages(customerId?: string): Promise<{
        messages: {
            id: string;
            from: any;
            to: any;
            content: string;
            timestamp: string;
            direction: string;
            customerId: string;
            customerName: any;
        }[];
        total: number;
    }>;
    getConversations(): Promise<{
        conversations: {
            id: string;
            customerId: string;
            customerName: string;
            messengerId: string;
            lastMessage: string;
            lastMessageAt: string;
            aiEnabled: boolean;
        }[];
        total: number;
    }>;
}
