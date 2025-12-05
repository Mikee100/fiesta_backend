import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConversationsService {
    constructor(private prisma: PrismaService) { }

    async getAllConversations(platform?: string, limit = 50, offset = 0) {
        // Get customers with their latest message
        const customers = await this.prisma.customer.findMany({
            where: {
                messages: {
                    some: platform ? { platform } : {},
                },
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        platform: true,
                        direction: true,
                    },
                },
                _count: {
                    select: {
                        messages: platform ? { where: { platform } } : true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
            take: limit,
            skip: offset,
        });

        return customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            whatsappId: customer.whatsappId,
            instagramId: customer.instagramId,
            messengerId: customer.messengerId,
            platform: customer.messages[0]?.platform || 'unknown',
            lastMessage: customer.messages[0]?.content || '',
            lastMessageAt: customer.messages[0]?.createdAt || customer.updatedAt,
            lastMessageDirection: customer.messages[0]?.direction || '',
            messageCount: customer._count.messages,
            isActive: this.isActive(customer.messages[0]?.createdAt),
        }));
    }

    async getConversationById(customerId: string) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                _count: {
                    select: { messages: true, bookings: true },
                },
            },
        });

        if (!customer) {
            throw new Error('Customer not found');
        }

        // Get platform from latest message
        const latestMessage = await this.prisma.message.findFirst({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            select: { platform: true, createdAt: true },
        });

        return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            whatsappId: customer.whatsappId,
            instagramId: customer.instagramId,
            messengerId: customer.messengerId,
            platform: latestMessage?.platform || 'unknown',
            messageCount: customer._count.messages,
            bookingCount: customer._count.bookings,
            lastActiveAt: latestMessage?.createdAt || customer.updatedAt,
            isActive: this.isActive(latestMessage?.createdAt),
            createdAt: customer.createdAt,
        };
    }

    async getConversationMessages(customerId: string, platform?: string) {
        const messages = await this.prisma.message.findMany({
            where: {
                customerId,
                ...(platform && { platform }),
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                content: true,
                platform: true,
                direction: true,
                createdAt: true,
            },
        });

        return messages;
    }

    async sendReply(customerId: string, message: string, platform: string) {
        // Create outbound message
        const savedMessage = await this.prisma.message.create({
            data: {
                content: message,
                platform,
                direction: 'outbound',
                customerId,
            },
        });

        return savedMessage;
    }

    private isActive(lastMessageAt?: Date): boolean {
        if (!lastMessageAt) return false;
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return lastMessageAt >= dayAgo;
    }
}
