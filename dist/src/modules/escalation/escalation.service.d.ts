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
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        customerId: string;
        status: string;
        updatedAt: Date;
        sentimentScore: number | null;
        description: string | null;
        reason: string | null;
        escalationType: string;
    }>;
    resolveEscalation(escalationId: string): Promise<{
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        customerId: string;
        status: string;
        updatedAt: Date;
        sentimentScore: number | null;
        description: string | null;
        reason: string | null;
        escalationType: string;
    }>;
    isCustomerEscalated(customerId: string): Promise<boolean>;
    getOpenEscalations(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
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
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        customerId: string;
        status: string;
        updatedAt: Date;
        sentimentScore: number | null;
        description: string | null;
        reason: string | null;
        escalationType: string;
    })[]>;
}
