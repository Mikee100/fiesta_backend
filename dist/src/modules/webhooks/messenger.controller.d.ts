import { MessengerService } from './messenger.service';
import { MessengerStatsService } from './messenger-stats.service';
import { Request, Response } from 'express';
export declare class MessengerController {
    private readonly messengerService;
    private readonly messengerStatsService;
    private readonly logger;
    constructor(messengerService: MessengerService, messengerStatsService: MessengerStatsService);
    verifyWebhook(mode: string, token: string, challenge: string, res: Response): Promise<Response<any, Record<string, any>>>;
    handleMessage(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    getStats(): Promise<{
        totalMessages: number;
        inboundMessages: number;
        outboundMessages: number;
        activeConversations: number;
        messagesThisWeek: number;
        messagesThisMonth: number;
        topCustomers: {
            name: string;
            messageCount: number;
        }[];
        messagesByDay: {
            date: string;
            count: number;
        }[];
        avgResponseTime: number;
    }>;
    getConversations(): Promise<{
        customerId: string;
        customerName: string;
        messengerId: string;
        lastMessageAt: Date;
        lastMessage: string;
        lastMessageDirection: string;
        messageCount: number;
    }[]>;
}
