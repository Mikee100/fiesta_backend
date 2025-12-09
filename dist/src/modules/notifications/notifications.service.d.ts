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
        createdAt: Date;
        message: string;
        type: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        title: string;
        read: boolean;
    }>;
    getNotifications(options?: {
        read?: boolean;
        type?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        notifications: {
            id: string;
            createdAt: Date;
            message: string;
            type: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            title: string;
            read: boolean;
        }[];
        total: number;
        unreadCount: number;
    }>;
    getUnreadCount(): Promise<number>;
    markAsRead(id: string): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        type: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        title: string;
        read: boolean;
    }>;
    markAllAsRead(): Promise<import(".prisma/client").Prisma.BatchPayload>;
    deleteOldReadNotifications(daysOld?: number): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
