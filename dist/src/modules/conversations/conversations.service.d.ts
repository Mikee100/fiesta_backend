import { PrismaService } from '../../prisma/prisma.service';
export declare class ConversationsService {
    private prisma;
    constructor(prisma: PrismaService);
    getAllConversations(platform?: string, limit?: number, offset?: number): Promise<{
        id: string;
        name: string;
        phone: string;
        whatsappId: string;
        instagramId: string;
        messengerId: string;
        platform: string;
        lastMessage: string;
        lastMessageAt: Date;
        lastMessageDirection: string;
        messageCount: number;
        isActive: boolean;
    }[]>;
    getConversationById(customerId: string): Promise<{
        id: string;
        name: string;
        phone: string;
        whatsappId: string;
        instagramId: string;
        messengerId: string;
        platform: string;
        messageCount: number;
        bookingCount: number;
        lastActiveAt: Date;
        isActive: boolean;
        createdAt: Date;
    }>;
    getConversationMessages(customerId: string, platform?: string): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
    }[]>;
    sendReply(customerId: string, message: string, platform: string): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        customerId: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    }>;
    private isActive;
}
