import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MessengerStatsService {
    constructor(private prisma: PrismaService) { }

    async getStats() {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Total messages
        const totalMessages = await this.prisma.message.count({
            where: { platform: 'messenger' },
        });

        // Messages by direction
        const inboundMessages = await this.prisma.message.count({
            where: { platform: 'messenger', direction: 'inbound' },
        });

        const outboundMessages = await this.prisma.message.count({
            where: { platform: 'messenger', direction: 'outbound' },
        });

        // Active conversations (customers who messaged in last 24 hours)
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const activeConversations = await this.prisma.customer.count({
            where: {
                messengerId: { not: null },
                lastMessengerMessageAt: { gte: dayAgo },
            },
        });

        // Messages this week
        const messagesThisWeek = await this.prisma.message.count({
            where: {
                platform: 'messenger',
                createdAt: { gte: weekAgo },
            },
        });

        // Messages this month
        const messagesThisMonth = await this.prisma.message.count({
            where: {
                platform: 'messenger',
                createdAt: { gte: monthAgo },
            },
        });

        // Top customers by message count
        const topCustomersData = await this.prisma.message.groupBy({
            by: ['customerId'],
            where: { platform: 'messenger' },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5,
        });

        const topCustomers = await Promise.all(
            topCustomersData.map(async (item) => {
                const customer = await this.prisma.customer.findUnique({
                    where: { id: item.customerId },
                    select: { name: true },
                });
                return {
                    name: customer?.name || 'Unknown',
                    messageCount: item._count.id,
                };
            })
        );

        // Messages by day (last 7 days)
        const messagesByDay = await this.getMessagesByDay(7);

        // Calculate average response time
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

    private async getMessagesByDay(days: number) {
        const messages = await this.prisma.message.findMany({
            where: {
                platform: 'messenger',
                createdAt: {
                    gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                },
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
        });

        // Group by date
        const grouped = messages.reduce((acc, msg) => {
            const date = msg.createdAt.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(grouped).map(([date, count]) => ({
            date,
            count,
        }));
    }

    private async calculateAvgResponseTime(): Promise<number> {
        const conversations = await this.prisma.message.findMany({
            where: { platform: 'messenger' },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                createdAt: true,
                direction: true,
                customerId: true,
            },
        });

        const responseTimes: number[] = [];
        let lastInbound: Date | null = null;

        for (const msg of conversations.reverse()) {
            if (msg.direction === 'inbound') {
                lastInbound = msg.createdAt;
            } else if (msg.direction === 'outbound' && lastInbound) {
                const responseTime = msg.createdAt.getTime() - lastInbound.getTime();
                responseTimes.push(responseTime);
                lastInbound = null;
            }
        }

        if (responseTimes.length === 0) return 0;

        const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        return Math.round(avgMs / 1000); // Return in seconds
    }

    async getConversations() {
        const conversations = await this.prisma.customer.findMany({
            where: {
                messengerId: { not: null },
                messages: {
                    some: { platform: 'messenger' },
                },
            },
            select: {
                id: true,
                name: true,
                messengerId: true,
                lastMessengerMessageAt: true,
                messages: {
                    where: { platform: 'messenger' },
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
                            where: { platform: 'messenger' },
                        },
                    },
                },
            },
            orderBy: { lastMessengerMessageAt: 'desc' },
            take: 20,
        });

        return conversations.map((conv) => ({
            customerId: conv.id,
            customerName: conv.name,
            messengerId: conv.messengerId,
            lastMessageAt: conv.lastMessengerMessageAt,
            lastMessage: conv.messages[0]?.content || '',
            lastMessageDirection: conv.messages[0]?.direction || '',
            messageCount: conv._count.messages,
        }));
    }
}
