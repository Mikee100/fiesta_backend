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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramStatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let InstagramStatsService = class InstagramStatsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getStats() {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const totalMessages = await this.prisma.message.count({
            where: { platform: 'instagram' },
        });
        const inboundMessages = await this.prisma.message.count({
            where: { platform: 'instagram', direction: 'inbound' },
        });
        const outboundMessages = await this.prisma.message.count({
            where: { platform: 'instagram', direction: 'outbound' },
        });
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const activeConversations = await this.prisma.customer.count({
            where: {
                instagramId: { not: null },
                lastInstagramMessageAt: { gte: dayAgo },
            },
        });
        const messagesThisWeek = await this.prisma.message.count({
            where: {
                platform: 'instagram',
                createdAt: { gte: weekAgo },
            },
        });
        const messagesThisMonth = await this.prisma.message.count({
            where: {
                platform: 'instagram',
                createdAt: { gte: monthAgo },
            },
        });
        const topCustomersData = await this.prisma.message.groupBy({
            by: ['customerId'],
            where: { platform: 'instagram' },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5,
        });
        const topCustomers = await Promise.all(topCustomersData.map(async (item) => {
            const customer = await this.prisma.customer.findUnique({
                where: { id: item.customerId },
                select: { name: true },
            });
            return {
                name: customer?.name || 'Unknown',
                messageCount: item._count.id,
            };
        }));
        const messagesByDay = await this.getMessagesByDay(7);
        const avgResponseTime = await this.calculateAvgResponseTime();
        return {
            totalMessages,
            inboundMessages,
            outboundMessages,
            activeConversations,
            messagesThisWeek,
            messagesThisMonth,
            topCustomers,
            messagesByDay,
            avgResponseTime,
        };
    }
    async getMessagesByDay(days) {
        const messages = await this.prisma.message.findMany({
            where: {
                platform: 'instagram',
                createdAt: {
                    gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                },
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
        const grouped = messages.reduce((acc, msg) => {
            const date = msg.createdAt.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(grouped).map(([date, count]) => ({
            date,
            count,
        }));
    }
    async calculateAvgResponseTime() {
        const conversations = await this.prisma.message.findMany({
            where: { platform: 'instagram' },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                createdAt: true,
                direction: true,
                customerId: true,
            },
        });
        const responseTimes = [];
        let lastInbound = null;
        for (const msg of conversations.reverse()) {
            if (msg.direction === 'inbound') {
                lastInbound = msg.createdAt;
            }
            else if (msg.direction === 'outbound' && lastInbound) {
                const responseTime = msg.createdAt.getTime() - lastInbound.getTime();
                responseTimes.push(responseTime);
                lastInbound = null;
            }
        }
        if (responseTimes.length === 0)
            return 0;
        const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        return Math.round(avgMs / 1000);
    }
    async getConversations() {
        const conversations = await this.prisma.customer.findMany({
            where: {
                instagramId: { not: null },
                messages: {
                    some: { platform: 'instagram' },
                },
            },
            select: {
                id: true,
                name: true,
                instagramId: true,
                lastInstagramMessageAt: true,
                messages: {
                    where: { platform: 'instagram' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        content: true,
                        createdAt: true,
                        direction: true,
                    },
                },
                _count: {
                    select: {
                        messages: {
                            where: { platform: 'instagram' },
                        },
                    },
                },
            },
            orderBy: { lastInstagramMessageAt: 'desc' },
            take: 20,
        });
        return conversations.map((conv) => ({
            customerId: conv.id,
            customerName: conv.name,
            instagramId: conv.instagramId,
            lastMessageAt: conv.lastInstagramMessageAt,
            lastMessage: conv.messages[0]?.content || '',
            lastMessageDirection: conv.messages[0]?.direction || '',
            messageCount: conv._count.messages,
        }));
    }
};
exports.InstagramStatsService = InstagramStatsService;
exports.InstagramStatsService = InstagramStatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InstagramStatsService);
//# sourceMappingURL=instagram-stats.service.js.map