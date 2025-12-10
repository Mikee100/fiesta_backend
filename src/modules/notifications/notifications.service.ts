import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => WebsocketGateway)) private websocketGateway?: WebsocketGateway
    ) { }

    /**
     * Create a new notification
     */
    async createNotification(data: {
        type: 'booking' | 'reschedule' | 'payment' | 'ai_escalation' | 'reschedule_request';
        title: string;
        message: string;
        metadata?: any;
    }) {
        try {
            const notification = await this.prisma.notification.create({
                data: {
                    type: data.type,
                    title: data.title,
                    message: data.message,
                    metadata: data.metadata || null,
                },
            });

            this.logger.log(`Notification created: ${notification.id} - ${notification.type}`);

            // Emit WebSocket event to admin clients
            if (this.websocketGateway) {
                try {
                    this.websocketGateway.emitNewNotification(notification);
                } catch (error) {
                    this.logger.error(`Failed to emit notification WebSocket event: ${error.message}`);
                }
            }

            return notification;
        } catch (error) {
            this.logger.error(`Failed to create notification: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Get notifications with optional filters
     */
    async getNotifications(options?: {
        read?: boolean;
        type?: string;
        limit?: number;
        offset?: number;
    }) {
        const where: any = {};

        if (options?.read !== undefined) {
            where.read = options.read;
        }

        if (options?.type) {
            // Handle both 'reschedule' and 'reschedule_request' types for backward compatibility
            if (options.type === 'reschedule_request') {
                where.type = { in: ['reschedule', 'reschedule_request'] };
            } else {
                where.type = options.type;
            }
        }

        const [notifications, total] = await Promise.all([
            this.prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: options?.limit || 50,
                skip: options?.offset || 0,
            }),
            this.prisma.notification.count({ where }),
        ]);

        return {
            notifications,
            total,
            unreadCount: await this.getUnreadCount(),
        };
    }

    /**
     * Get count of unread notifications
     */
    async getUnreadCount() {
        return this.prisma.notification.count({
            where: { read: false },
        });
    }

    /**
     * Mark a single notification as read
     */
    async markAsRead(id: string) {
        return this.prisma.notification.update({
            where: { id },
            data: { read: true },
        });
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead() {
        const result = await this.prisma.notification.updateMany({
            where: { read: false },
            data: { read: true },
        });

        this.logger.log(`Marked ${result.count} notifications as read`);
        return result;
    }

    /**
     * Delete old read notifications (cleanup utility)
     */
    async deleteOldReadNotifications(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await this.prisma.notification.deleteMany({
            where: {
                read: true,
                createdAt: {
                    lt: cutoffDate,
                },
            },
        });

        this.logger.log(`Deleted ${result.count} old read notifications`);
        return result;
    }
}
