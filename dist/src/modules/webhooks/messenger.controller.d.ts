import { MessengerService } from './messenger.service';
import { MessengerStatsService } from './messenger-stats.service';
import { MessengerSendService } from './messenger-send.service';
import { Request, Response } from 'express';
export declare class MessengerController {
    private readonly messengerService;
    private readonly messengerStatsService;
    private readonly messengerSendService;
    private readonly logger;
    constructor(messengerService: MessengerService, messengerStatsService: MessengerStatsService, messengerSendService: MessengerSendService);
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
    getConversationsList(): Promise<{
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
    sendMessage(data: {
        to: string;
        message: string;
    }): Promise<any>;
    testConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
}
