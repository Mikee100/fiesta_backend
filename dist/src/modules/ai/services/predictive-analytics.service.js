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
var PredictiveAnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictiveAnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let PredictiveAnalyticsService = PredictiveAnalyticsService_1 = class PredictiveAnalyticsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PredictiveAnalyticsService_1.name);
    }
    async calculateLeadScore(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                messages: { take: 20, orderBy: { createdAt: 'desc' } },
                bookingDrafts: true,
                bookings: true,
                customerMemory: true,
            },
        });
        if (!customer)
            return 0;
        let score = 0;
        if (customer.bookingDrafts.length > 0)
            score += 30;
        if (customer.messages.length >= 5)
            score += 20;
        else if (customer.messages.length >= 3)
            score += 10;
        if (customer.bookings.length > 0)
            score += 25;
        const lastMessage = customer.messages[0];
        if (lastMessage) {
            const hoursSinceLastMessage = (Date.now() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastMessage < 24)
                score += 15;
            else if (hoursSinceLastMessage < 72)
                score += 5;
        }
        if (customer.customerMemory) {
            if (customer.customerMemory.budgetMin || customer.customerMemory.budgetMax)
                score += 10;
            if (customer.customerMemory.preferredPackages.length > 0)
                score += 10;
            if (customer.customerMemory.relationshipStage === 'interested')
                score += 15;
            else if (customer.customerMemory.relationshipStage === 'returning')
                score += 20;
        }
        return Math.min(100, score);
    }
    async predictChurnRisk(customerId) {
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
        const reasons = [];
        const lastBooking = customer.bookings[0];
        const daysSinceLastBooking = (Date.now() - lastBooking.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastBooking > 365) {
            churnScore += 40;
            reasons.push('No booking in over a year');
        }
        else if (daysSinceLastBooking > 180) {
            churnScore += 20;
            reasons.push('No booking in 6+ months');
        }
        const lastMessage = customer.messages[0];
        if (lastMessage) {
            const daysSinceLastMessage = (Date.now() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastMessage > 90) {
                churnScore += 20;
                reasons.push('No engagement in 3+ months');
            }
        }
        if (customer.customerMemory?.satisfactionScore && customer.customerMemory.satisfactionScore < 3) {
            churnScore += 30;
            reasons.push('Low satisfaction score');
        }
        let risk;
        if (churnScore >= 60)
            risk = 'high';
        else if (churnScore >= 30)
            risk = 'medium';
        else
            risk = 'low';
        return { risk, score: churnScore, reasons };
    }
    async identifyUpsellOpportunities(customerId) {
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
        const opportunities = [];
        const recommendedPackages = [];
        let confidence = 0;
        if (customer.bookings.length > 0) {
            confidence = 0.8;
            const lastBooking = customer.bookings[0];
            const packageName = lastBooking.service.toLowerCase();
            if (packageName.includes('standard')) {
                opportunities.push('Upgrade to Gold Package for enhanced experience');
                recommendedPackages.push('Gold Package');
            }
            else if (packageName.includes('gold')) {
                opportunities.push('Try our Platinum Package for ultimate luxury');
                recommendedPackages.push('Platinum Package');
            }
            if (!packageName.includes('outdoor')) {
                opportunities.push('Add outdoor beach session for variety');
                recommendedPackages.push('Beach Outdoor Package');
            }
            const daysSinceBooking = (Date.now() - lastBooking.dateTime.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceBooking > 60 && daysSinceBooking < 180) {
                opportunities.push('Book newborn session - perfect timing!');
                confidence = 0.9;
            }
        }
        if (customer.customerMemory?.relationshipStage === 'vip') {
            opportunities.push('Exclusive VIP package with priority booking');
            confidence = Math.max(confidence, 0.85);
        }
        if (customer.customerMemory && customer.customerMemory.lifetimeValue > 30000) {
            opportunities.push('Package bundle discount for multiple sessions');
            confidence = Math.max(confidence, 0.75);
        }
        return { opportunities, recommendedPackages, confidence };
    }
    async predictBestFollowUpTime(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                messages: { orderBy: { createdAt: 'desc' }, take: 50 },
                customerMemory: true,
            },
        });
        if (!customer || customer.messages.length === 0) {
            const defaultTime = new Date();
            defaultTime.setHours(defaultTime.getHours() + 24);
            return { time: defaultTime, confidence: 0.3 };
        }
        const messageHours = customer.messages.map(m => m.createdAt.getHours());
        const mostCommonHour = this.getMostCommonValue(messageHours);
        const messageDays = customer.messages.map(m => m.createdAt.getDay());
        const mostCommonDay = this.getMostCommonValue(messageDays);
        const now = new Date();
        const followUpTime = new Date();
        followUpTime.setHours(mostCommonHour, 0, 0, 0);
        if (followUpTime <= now) {
            followUpTime.setDate(followUpTime.getDate() + 1);
        }
        const currentDay = followUpTime.getDay();
        if (currentDay !== mostCommonDay && messageHours.length > 5) {
            const daysToAdd = (mostCommonDay - currentDay + 7) % 7;
            followUpTime.setDate(followUpTime.getDate() + daysToAdd);
        }
        const confidence = customer.messages.length >= 10 ? 0.8 : 0.5;
        return { time: followUpTime, confidence };
    }
    async generateDashboard() {
        const [totalCustomers, activeCustomers, totalBookings, avgLeadScore, highValueCustomers, churnRiskCustomers,] = await Promise.all([
            this.prisma.customer.count(),
            this.prisma.customer.count({
                where: {
                    messages: {
                        some: {
                            createdAt: {
                                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
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
    getMostCommonValue(values) {
        const counts = new Map();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 14;
    }
    async calculateAverageLeadScore() {
        const customers = await this.prisma.customer.findMany({ take: 100 });
        const scores = await Promise.all(customers.map(c => this.calculateLeadScore(c.id)));
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }
    async getHighValueCustomers() {
        return this.prisma.customerMemory.findMany({
            where: { lifetimeValue: { gte: 30000 } },
            include: { customer: true },
        });
    }
    async getChurnRiskCustomers() {
        const customers = await this.prisma.customer.findMany({
            where: {
                bookings: { some: {} },
            },
            take: 100,
        });
        const atRisk = [];
        for (const customer of customers) {
            const churnRisk = await this.predictChurnRisk(customer.id);
            if (churnRisk.risk === 'high' || churnRisk.risk === 'medium') {
                atRisk.push({ customer, churnRisk });
            }
        }
        return atRisk;
    }
};
exports.PredictiveAnalyticsService = PredictiveAnalyticsService;
exports.PredictiveAnalyticsService = PredictiveAnalyticsService = PredictiveAnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PredictiveAnalyticsService);
//# sourceMappingURL=predictive-analytics.service.js.map