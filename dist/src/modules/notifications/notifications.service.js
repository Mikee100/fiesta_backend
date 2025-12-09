"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const websocket_gateway_1 = require("../../websockets/websocket.gateway");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(prisma, websocketGateway) {
        this.prisma = prisma;
        this.websocketGateway = websocketGateway;
        this.logger = new common_1.Logger(NotificationsService_1.name);
    }
    async createNotification(data) {
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
            if (this.websocketGateway) {
                try {
                    this.websocketGateway.emitNewNotification(notification);
                }
                catch (error) {
                    this.logger.error(`Failed to emit notification WebSocket event: ${error.message}`);
                }
            }
            return notification;
        }
        catch (error) {
            this.logger.error(`Failed to create notification: ${error.message}`, error);
            throw error;
        }
    }
    async getNotifications(options) {
        const where = {};
        if (options?.read !== undefined) {
            where.read = options.read;
        }
        if (options?.type) {
            where.type = options.type;
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
    async getUnreadCount() {
        return this.prisma.notification.count({
            where: { read: false },
        });
    }
    async markAsRead(id) {
        return this.prisma.notification.update({
            where: { id },
            data: { read: true },
        });
    }
    async markAllAsRead() {
        const result = await this.prisma.notification.updateMany({
            where: { read: false },
            data: { read: true },
        });
        this.logger.log(`Marked ${result.count} notifications as read`);
        return result;
    }
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
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => websocket_gateway_1.WebsocketGateway))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        websocket_gateway_1.WebsocketGateway])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map