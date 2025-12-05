// src/modules/ai/services/customer-memory.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

interface CustomerPreferences {
    preferredPackages?: string[];
    budgetMin?: number;
    budgetMax?: number;
    preferredTimes?: string[];
    communicationStyle?: 'brief' | 'detailed' | 'friendly';
}

interface ConversationSummary {
    date: Date;
    intent: string;
    outcome: string;
    keyPoints: string[];
    satisfaction?: number;
}

@Injectable()
export class CustomerMemoryService {
    private readonly logger = new Logger(CustomerMemoryService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Get or create customer memory profile
     */
    async getOrCreateMemory(customerId: string) {
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

    /**
     * Update customer preferences based on conversation
     */
    async updatePreferences(customerId: string, preferences: CustomerPreferences) {
        const memory = await this.getOrCreateMemory(customerId);

        const updates: any = {};

        if (preferences.preferredPackages && preferences.preferredPackages.length > 0) {
            // Merge with existing, keep unique
            const existing = memory.preferredPackages || [];
            updates.preferredPackages = [...new Set([...existing, ...preferences.preferredPackages])];
        }

        if (preferences.budgetMin !== undefined) updates.budgetMin = preferences.budgetMin;
        if (preferences.budgetMax !== undefined) updates.budgetMax = preferences.budgetMax;

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

    /**
     * Add conversation summary to memory
     */
    async addConversationSummary(customerId: string, summary: ConversationSummary) {
        const memory = await this.getOrCreateMemory(customerId);

        const summaries = memory.conversationSummaries as any[] || [];
        summaries.push({
            ...summary,
            date: summary.date.toISOString(),
        });

        // Keep only last 20 summaries
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

    /**
     * Update relationship stage based on customer journey
     */
    async updateRelationshipStage(customerId: string, stage: 'new' | 'interested' | 'booked' | 'returning' | 'vip') {
        await this.prisma.customerMemory.update({
            where: { customerId },
            data: { relationshipStage: stage },
        });

        this.logger.log(`Updated relationship stage for customer ${customerId} to ${stage}`);
    }

    /**
     * Add key insight about customer
     */
    async addInsight(customerId: string, insight: string) {
        const memory = await this.getOrCreateMemory(customerId);
        const insights = memory.keyInsights || [];

        // Avoid duplicates
        if (!insights.includes(insight)) {
            insights.push(insight);

            await this.prisma.customerMemory.update({
                where: { customerId },
                data: { keyInsights: insights },
            });

            this.logger.debug(`Added insight for customer ${customerId}: ${insight}`);
        }
    }

    /**
     * Update lifetime value after booking
     */
    async updateLifetimeValue(customerId: string, bookingValue: number) {
        const memory = await this.getOrCreateMemory(customerId);
        const newLTV = memory.lifetimeValue + bookingValue;

        await this.prisma.customerMemory.update({
            where: { customerId },
            data: {
                lifetimeValue: newLTV,
                totalBookings: { increment: 1 },
            },
        });

        // Auto-upgrade to VIP if LTV > 50000 KSH
        if (newLTV > 50000 && memory.relationshipStage !== 'vip') {
            await this.updateRelationshipStage(customerId, 'vip');
        }

        this.logger.log(`Updated LTV for customer ${customerId}: ${newLTV} KSH`);
    }

    /**
     * Update satisfaction score from feedback
     */
    async updateSatisfaction(customerId: string, rating: number) {
        const memory = await this.getOrCreateMemory(customerId);

        // Calculate rolling average
        const currentScore = memory.satisfactionScore || rating;
        const newScore = (currentScore + rating) / 2;

        await this.prisma.customerMemory.update({
            where: { customerId },
            data: { satisfactionScore: newScore },
        });

        this.logger.debug(`Updated satisfaction score for customer ${customerId}: ${newScore}`);
    }

    /**
     * Get personalization context for AI
     */
    async getPersonalizationContext(customerId: string) {
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

    /**
     * Detect communication style from messages
     */
    detectCommunicationStyle(messages: string[]): 'brief' | 'detailed' | 'friendly' {
        const avgLength = messages.reduce((sum, msg) => sum + msg.length, 0) / messages.length;
        const hasEmojis = messages.some(msg => /[\u{1F300}-\u{1F9FF}]/u.test(msg));
        const hasExclamations = messages.some(msg => msg.includes('!'));

        if (avgLength < 50 && !hasEmojis) return 'brief';
        if (hasEmojis || hasExclamations) return 'friendly';
        return 'detailed';
    }

    /**
     * Extract preferred time from booking patterns
     */
    async extractPreferredTimes(customerId: string): Promise<string[]> {
        const bookings = await this.prisma.booking.findMany({
            where: { customerId, status: 'confirmed' },
            select: { dateTime: true },
        });

        const times: string[] = [];
        bookings.forEach(booking => {
            const hour = booking.dateTime.getHours();
            if (hour >= 6 && hour < 12) times.push('morning');
            else if (hour >= 12 && hour < 17) times.push('afternoon');
            else times.push('evening');
        });

        return [...new Set(times)];
    }
}
