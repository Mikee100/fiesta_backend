import { PrismaService } from '../../prisma/prisma.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
export declare class NotificationsService {
    private prisma;
    private websocketGateway?;
    private readonly logger;
    constructor(prisma: PrismaService, websocketGateway?: WebsocketGateway);
    createNotification(data: {
        type: 'booking' | 'reschedule' | 'payment' | 'ai_escalation' | 'reschedule_request';
        title: string;
        message: string;
        metadata?: any;
    }): Promise<{
        id: string;
        type: string;
        title: string;
        message: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        read: boolean;
        createdAt: Date;
    }>;
    getNotifications(options?: {
        read?: boolean;
        type?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        notifications: {
            id: string;
            type: string;
            title: string;
            message: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            read: boolean;
            createdAt: Date;
        }[];
        total: number;
        unreadCount: number;
    }>;
    getUnreadCount(): Promise<number>;
    markAsRead(id: string): Promise<{
        id: string;
        type: string;
        title: string;
        message: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        read: boolean;
        createdAt: Date;
    }>;
    markAllAsRead(): Promise<import(".prisma/client").Prisma.BatchPayload>;
    deleteOldReadNotifications(daysOld?: number): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
