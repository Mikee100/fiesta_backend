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
var CustomerMemoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerMemoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let CustomerMemoryService = CustomerMemoryService_1 = class CustomerMemoryService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CustomerMemoryService_1.name);
    }
    async getOrCreateMemory(customerId) {
        let memory = await this.prisma.customerMemory.findUnique({
            where: { customerId },
        });
        if (!memory) {
            memory = await this.prisma.customerMemory.create({
                data: {
                    customerId,
                    relationshipStage: 'new',
                },
            });
            this.logger.log(`Created new memory profile for customer ${customerId}`);
        }
        return memory;
    }
    async updatePreferences(customerId, preferences) {
        const memory = await this.getOrCreateMemory(customerId);
        const updates = {};
        if (preferences.preferredPackages && preferences.preferredPackages.length > 0) {
            const existing = memory.preferredPackages || [];
            updates.preferredPackages = [...new Set([...existing, ...preferences.preferredPackages])];
        }
        if (preferences.budgetMin !== undefined)
            updates.budgetMin = preferences.budgetMin;
        if (preferences.budgetMax !== undefined)
            updates.budgetMax = preferences.budgetMax;
        if (preferences.preferredTimes && preferences.preferredTimes.length > 0) {
            const existing = memory.preferredTimes || [];
            updates.preferredTimes = [...new Set([...existing, ...preferences.preferredTimes])];
        }
        if (preferences.communicationStyle) {
            updates.communicationStyle = preferences.communicationStyle;
        }
        if (Object.keys(updates).length > 0) {
            await this.prisma.customerMemory.update({
                where: { customerId },
                data: updates,
            });
            this.logger.debug(`Updated preferences for customer ${customerId}`);
        }
        return this.getOrCreateMemory(customerId);
    }
    async addConversationSummary(customerId, summary) {
        const memory = await this.getOrCreateMemory(customerId);
        const summaries = memory.conversationSummaries || [];
        summaries.push({
            ...summary,
            date: summary.date.toISOString(),
        });
        const recentSummaries = summaries.slice(-20);
        await this.prisma.customerMemory.update({
            where: { customerId },
            data: {
                conversationSummaries: recentSummaries,
                lastInteractionSummary: summary.keyPoints.join('; '),
            },
        });
        this.logger.debug(`Added conversation summary for customer ${customerId}`);
    }
    async updateRelationshipStage(customerId, stage) {
        await this.prisma.customerMemory.update({
            where: { customerId },
            data: { relationshipStage: stage },
        });
        this.logger.log(`Updated relationship stage for customer ${customerId} to ${stage}`);
    }
    async addInsight(customerId, insight) {
        const memory = await this.getOrCreateMemory(customerId);
        const insights = memory.keyInsights || [];
        if (!insights.includes(insight)) {
            insights.push(insight);
            await this.prisma.customerMemory.update({
                where: { customerId },
                data: { keyInsights: insights },
            });
            this.logger.debug(`Added insight for customer ${customerId}: ${insight}`);
        }
    }
    async updateLifetimeValue(customerId, bookingValue) {
        const memory = await this.getOrCreateMemory(customerId);
        const newLTV = memory.lifetimeValue + bookingValue;
        await this.prisma.customerMemory.update({
            where: { customerId },
            data: {
                lifetimeValue: newLTV,
                totalBookings: { increment: 1 },
            },
        });
        if (newLTV > 50000 && memory.relationshipStage !== 'vip') {
            await this.updateRelationshipStage(customerId, 'vip');
        }
        this.logger.log(`Updated LTV for customer ${customerId}: ${newLTV} KSH`);
    }
    async updateSatisfaction(customerId, rating) {
        const memory = await this.getOrCreateMemory(customerId);
        const currentScore = memory.satisfactionScore || rating;
        const newScore = (currentScore + rating) / 2;
        await this.prisma.customerMemory.update({
            where: { customerId },
            data: { satisfactionScore: newScore },
        });
        this.logger.debug(`Updated satisfaction score for customer ${customerId}: ${newScore}`);
    }
    async getPersonalizationContext(customerId) {
        const memory = await this.getOrCreateMemory(customerId);
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                bookings: {
                    where: { status: { in: ['confirmed', 'pending'] } },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                },
            },
        });
        return {
            relationshipStage: memory.relationshipStage,
            preferredPackages: memory.preferredPackages,
            budgetRange: memory.budgetMin && memory.budgetMax
                ? { min: memory.budgetMin, max: memory.budgetMax }
                : null,
            preferredTimes: memory.preferredTimes,
            communicationStyle: memory.communicationStyle || 'friendly',
            lifetimeValue: memory.lifetimeValue,
            totalBookings: memory.totalBookings,
            satisfactionScore: memory.satisfactionScore,
            keyInsights: memory.keyInsights,
            lastInteraction: memory.lastInteractionSummary,
            recentBookings: customer?.bookings || [],
            isVIP: memory.relationshipStage === 'vip',
            isReturning: memory.totalBookings > 0,
        };
    }
    detectCommunicationStyle(messages) {
        const avgLength = messages.reduce((sum, msg) => sum + msg.length, 0) / messages.length;
        const hasEmojis = messages.some(msg => /[\u{1F300}-\u{1F9FF}]/u.test(msg));
        const hasExclamations = messages.some(msg => msg.includes('!'));
        if (avgLength < 50 && !hasEmojis)
            return 'brief';
        if (hasEmojis || hasExclamations)
            return 'friendly';
        return 'detailed';
    }
    async extractPreferredTimes(customerId) {
        const bookings = await this.prisma.booking.findMany({
            where: { customerId, status: 'confirmed' },
            select: { dateTime: true },
        });
        const times = [];
        bookings.forEach(booking => {
            const hour = booking.dateTime.getHours();
            if (hour >= 6 && hour < 12)
                times.push('morning');
            else if (hour >= 12 && hour < 17)
                times.push('afternoon');
            else
                times.push('evening');
        });
        return [...new Set(times)];
    }
};
exports.CustomerMemoryService = CustomerMemoryService;
exports.CustomerMemoryService = CustomerMemoryService = CustomerMemoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomerMemoryService);
//# sourceMappingURL=customer-memory.service.js.map