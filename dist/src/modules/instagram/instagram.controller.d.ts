import { InstagramService } from './instagram.service';
import { InstagramStatsService } from './instagram-stats.service';
export declare class InstagramController {
    private readonly instagramService;
    private readonly instagramStatsService;
    constructor(instagramService: InstagramService, instagramStatsService: InstagramStatsService);
    getSettings(): Promise<{
        businessAccountId: string;
        accessToken: string;
        verifyToken: any;
        webhookUrl: any;
    }>;
    updateSettings(settings: any): Promise<{
        success: boolean;
    }>;
    testConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
    canSendMessage(instagramId: string): Promise<{
        allowed: boolean;
        reason?: string;
        lastMessageAt?: Date;
        hoursRemaining?: number;
    }>;
    sendMessage(body: {
        to: string;
        message: string;
    }): Promise<any>;
    getMessages(page?: string, limit?: string, direction?: string, customerId?: string): Promise<{
        messages: {
            id: string;
            from: string;
            to: string;
            content: string;
            timestamp: string;
            direction: string;
            customerId: string;
            customerName: string;
        }[];
        total: number;
    }>;
    getConversations(): Promise<{
        conversations: unknown[];
        total: number;
    }>;
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
    getAnalyticsConversations(): Promise<{
        customerId: string;
        customerName: string;
        instagramId: string;
        lastMessageAt: Date;
        lastMessage: string;
        lastMessageDirection: string;
        messageCount: number;
    }[]>;
}
