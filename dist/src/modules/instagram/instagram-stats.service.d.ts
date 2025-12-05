import { PrismaService } from '../../prisma/prisma.service';
export declare class InstagramStatsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    private getMessagesByDay;
    private calculateAvgResponseTime;
    getConversations(): Promise<{
        customerId: string;
        customerName: string;
        instagramId: string;
        lastMessageAt: Date;
        lastMessage: string;
        lastMessageDirection: string;
        messageCount: number;
    }[]>;
}
