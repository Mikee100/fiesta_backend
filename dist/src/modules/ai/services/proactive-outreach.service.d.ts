import { Queue } from 'bull';
import { PrismaService } from '../../../prisma/prisma.service';
import { MessagesService } from '../../messages/messages.service';
export declare class ProactiveOutreachService {
    private prisma;
    private messagesService;
    private outreachQueue;
    private readonly logger;
    constructor(prisma: PrismaService, messagesService: MessagesService, outreachQueue: Queue);
    detectAbandonedBookings(): Promise<number>;
    schedulePregnancyMilestones(): Promise<number>;
    sendPostShootFollowup(): Promise<number>;
    reengageInactiveCustomers(): Promise<number>;
    celebrateMilestones(): Promise<number>;
    scheduleOutreach(data: {
        customerId: string;
        type: string;
        messageContent: string;
        scheduledFor: Date;
        campaignId?: string;
        metadata?: any;
    }): Promise<{
        id: string;
        customerId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        deliveredAt: Date | null;
        messageContent: string;
        channel: string;
        campaignId: string | null;
        responseReceived: boolean;
    }>;
    processOutreach(outreachId: string): Promise<void>;
    private generateAbandonedBookingMessage;
    private generateMilestoneMessage;
    private generatePostShootMessage;
    private generateReengagementMessage;
    private generateMilestoneAnniversaryMessage;
    getOutreachStats(days?: number): Promise<{
        total: number;
        sent: number;
        pending: number;
        failed: number;
        responseRate: number;
        byType: Record<string, number>;
    }>;
}
