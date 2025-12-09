import { PrismaService } from '../../prisma/prisma.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { NotificationsService } from '../notifications/notifications.service';
export declare class EscalationService {
    private prisma;
    private websocketGateway?;
    private notificationsService?;
    private readonly logger;
    constructor(prisma: PrismaService, websocketGateway?: WebsocketGateway, notificationsService?: NotificationsService);
    createEscalation(customerId: string, reason?: string, escalationType?: string, metadata?: any, sentimentScore?: number): Promise<{
        id: string;
        reason: string | null;
        description: string | null;
        status: string;
        escalationType: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        sentimentScore: number | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    }>;
    resolveEscalation(escalationId: string): Promise<{
        id: string;
        reason: string | null;
        description: string | null;
        status: string;
        escalationType: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        sentimentScore: number | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    }>;
    isCustomerEscalated(customerId: string): Promise<boolean>;
    getOpenEscalations(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            email: string | null;
            phone: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
        };
    } & {
        id: string;
        reason: string | null;
        description: string | null;
        status: string;
        escalationType: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        sentimentScore: number | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
    })[]>;
}
