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
exports.ConversationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ConversationsService = class ConversationsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllConversations(platform, limit = 50, offset = 0) {
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
    async getConversationById(customerId) {
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
    async getConversationMessages(customerId, platform) {
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
    async sendReply(customerId, message, platform) {
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
    isActive(lastMessageAt) {
        if (!lastMessageAt)
            return false;
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return lastMessageAt >= dayAgo;
    }
};
exports.ConversationsService = ConversationsService;
exports.ConversationsService = ConversationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ConversationsService);
//# sourceMappingURL=conversations.service.js.map