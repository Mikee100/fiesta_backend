// src/modules/ai/services/predictive-analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PredictiveAnalyticsService {
    private readonly logger = new Logger(PredictiveAnalyticsService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Calculate lead score (likelihood to book)
     */
    async calculateLeadScore(customerId: string): Promise<number> {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                messages: { take: 20, orderBy: { createdAt: 'desc' } },
                bookingDrafts: true,
                bookings: true,
                customerMemory: true,
            },
        });

        if (!customer) return 0;

        let score = 0;

        // Has active booking draft (+30 points)
        if (customer.bookingDrafts.length > 0) score += 30;

        // Message engagement (+20 points for 5+ messages)
        if (customer.messages.length >= 5) score += 20;
        else if (customer.messages.length >= 3) score += 10;

        // Has booked before (+25 points)
        if (customer.bookings.length > 0) score += 25;

        // Recent activity (+15 points if messaged in last 24h)
        const lastMessage = customer.messages[0];
        if (lastMessage) {
            const hoursSinceLastMessage = (Date.now() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastMessage < 24) score += 15;
            else if (hoursSinceLastMessage < 72) score += 5;
        }

        // Customer memory insights
        if (customer.customerMemory) {
            // Has budget defined (+10 points)
            if (customer.customerMemory.budgetMin || customer.customerMemory.budgetMax) score += 10;

            // Has preferred packages (+10 points)
            if (customer.customerMemory.preferredPackages.length > 0) score += 10;

            // Relationship stage
            if (customer.customerMemory.relationshipStage === 'interested') score += 15;
            else if (customer.customerMemory.relationshipStage === 'returning') score += 20;
        }

        // Normalize to 0-100
        return Math.min(100, score);
    }

    /**
     * Predict churn risk for existing customers
     */
    async predictChurnRisk(customerId: string): Promise<{ risk: 'low' | 'medium' | 'high'; score: number; reasons: string[] }> {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                bookings: { orderBy: { createdAt: 'desc' }, take: 5 },
                messages: { orderBy: { createdAt: 'desc' }, take: 10 },
                customerMemory: true,
            },
        });

        if (!customer || customer.bookings.length === 0) {
            return { risk: 'low', score: 0, reasons: ['Not an existing customer'] };
        }

        let churnScore = 0;
        const reasons: string[] = [];

        // Time since last booking
        const lastBooking = customer.bookings[0];
        const daysSinceLastBooking = (Date.now() - lastBooking.createdAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceLastBooking > 365) {
            churnScore += 40;
            reasons.push('No booking in over a year');
        } else if (daysSinceLastBooking > 180) {
            churnScore += 20;
            reasons.push('No booking in 6+ months');
        }

        // Message engagement
        const lastMessage = customer.messages[0];
        if (lastMessage) {
            const daysSinceLastMessage = (Date.now() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastMessage > 90) {
                churnScore += 20;
                reasons.push('No engagement in 3+ months');
            }
        }

        // Satisfaction score
        if (customer.customerMemory?.satisfactionScore && customer.customerMemory.satisfactionScore < 3) {
            churnScore += 30;
            reasons.push('Low satisfaction score');
        }

        // Determine risk level
        let risk: 'low' | 'medium' | 'high';
        if (churnScore >= 60) risk = 'high';
        else if (churnScore >= 30) risk = 'medium';
        else risk = 'low';

        return { risk, score: churnScore, reasons };
    }

    /**
     * Identify upsell opportunities
     */
    async identifyUpsellOpportunities(customerId: string): Promise<{
        opportunities: string[];
        recommendedPackages: string[];
        confidence: number;
    }> {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                bookings: { orderBy: { createdAt: 'desc' }, take: 5 },
                customerMemory: true,
            },
        });

        if (!customer) {
            return { opportunities: [], recommendedPackages: [], confidence: 0 };
        }

        const opportunities: string[] = [];
        const recommendedPackages: string[] = [];
        let confidence = 0;

        // Has booked before - high confidence for upsell
        if (customer.bookings.length > 0) {
            confidence = 0.8;

            const lastBooking = customer.bookings[0];
            const packageName = lastBooking.service.toLowerCase();

            // Upgrade path
            if (packageName.includes('standard')) {
                opportunities.push('Upgrade to Gold Package for enhanced experience');
                recommendedPackages.push('Gold Package');
            } else if (packageName.includes('gold')) {
                opportunities.push('Try our Platinum Package for ultimate luxury');
                recommendedPackages.push('Platinum Package');
            }

            // Additional services
            if (!packageName.includes('outdoor')) {
                opportunities.push('Add outdoor beach session for variety');
                recommendedPackages.push('Beach Outdoor Package');
            }

            // Newborn session
            const daysSinceBooking = (Date.now() - lastBooking.dateTime.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceBooking > 60 && daysSinceBooking < 180) {
                opportunities.push('Book newborn session - perfect timing!');
                confidence = 0.9;
            }
        }

        // VIP customer - always upsell premium
        if (customer.customerMemory?.relationshipStage === 'vip') {
            opportunities.push('Exclusive VIP package with priority booking');
            confidence = Math.max(confidence, 0.85);
        }

        // High lifetime value - bundle opportunities
        if (customer.customerMemory && customer.customerMemory.lifetimeValue > 30000) {
            opportunities.push('Package bundle discount for multiple sessions');
            confidence = Math.max(confidence, 0.75);
        }

        return { opportunities, recommendedPackages, confidence };
    }

    /**
     * Predict best time to follow up
     */
    async predictBestFollowUpTime(customerId: string): Promise<{ time: Date; confidence: number }> {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                messages: { orderBy: { createdAt: 'desc' }, take: 50 },
                customerMemory: true,
            },
        });

        if (!customer || customer.messages.length === 0) {
            // Default: 24 hours from now
            const defaultTime = new Date();
            defaultTime.setHours(defaultTime.getHours() + 24);
            return { time: defaultTime, confidence: 0.3 };
        }

        // Analyze message patterns
        const messageHours = customer.messages.map(m => m.createdAt.getHours());
        const mostCommonHour = this.getMostCommonValue(messageHours);

        // Analyze day patterns
        const messageDays = customer.messages.map(m => m.createdAt.getDay());
        const mostCommonDay = this.getMostCommonValue(messageDays);

        // Calculate next occurrence of preferred time
        const now = new Date();
        const followUpTime = new Date();

        // Set to preferred hour
        followUpTime.setHours(mostCommonHour, 0, 0, 0);

        // If that time has passed today, move to tomorrow
        if (followUpTime <= now) {
            followUpTime.setDate(followUpTime.getDate() + 1);
        }

        // Adjust to preferred day if significantly different
        const currentDay = followUpTime.getDay();
        if (currentDay !== mostCommonDay && messageHours.length > 5) {
            const daysToAdd = (mostCommonDay - currentDay + 7) % 7;
            followUpTime.setDate(followUpTime.getDate() + daysToAdd);
        }

        const confidence = customer.messages.length >= 10 ? 0.8 : 0.5;

        return { time: followUpTime, confidence };
    }

    /**
     * Generate analytics dashboard data
     */
    async generateDashboard() {
        const [
            totalCustomers,
            activeCustomers,
            totalBookings,
            avgLeadScore,
            highValueCustomers,
            churnRiskCustomers,
        ] = await Promise.all([
            this.prisma.customer.count(),
            this.prisma.customer.count({
                where: {
                    messages: {
                        some: {
                            createdAt: {
                                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                            },
                        },
                    },
                },
            }),
            this.prisma.booking.count({ where: { status: 'confirmed' } }),
            this.calculateAverageLeadScore(),
            this.getHighValueCustomers(),
            this.getChurnRiskCustomers(),
        ]);

        return {
            totalCustomers,
            activeCustomers,
            totalBookings,
            avgLeadScore,
            highValueCustomers: highValueCustomers.length,
            churnRiskCustomers: churnRiskCustomers.length,
            conversionRate: totalBookings / totalCustomers,
        };
    }

    // Helper methods
    private getMostCommonValue(values: number[]): number {
        const counts = new Map<number, number>();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 14; // Default to 2 PM
    }

    private async calculateAverageLeadScore(): Promise<number> {
        const customers = await this.prisma.customer.findMany({ take: 100 });
        const scores = await Promise.all(customers.map(c => this.calculateLeadScore(c.id)));
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    private async getHighValueCustomers() {
        return this.prisma.customerMemory.findMany({
            where: { lifetimeValue: { gte: 30000 } },
            include: { customer: true },
        });
    }

    private async getChurnRiskCustomers() {
        const customers = await this.prisma.customer.findMany({
            where: {
                bookings: { some: {} }, // Has at least one booking
            },
            take: 100,
        });

        const atRisk: any[] = [];
        for (const customer of customers) {
            const churnRisk = await this.predictChurnRisk(customer.id);
            if (churnRisk.risk === 'high' || churnRisk.risk === 'medium') {
                atRisk.push({ customer, churnRisk });
            }
        }

        return atRisk;
    }
}
