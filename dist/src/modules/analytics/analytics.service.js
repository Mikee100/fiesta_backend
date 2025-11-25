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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const sentiment_util_1 = require("./sentiment.util");
const messages_service_1 = require("../messages/messages.service");
const keyword_extractor = require('keyword-extractor');
let AnalyticsService = class AnalyticsService {
    constructor(prisma, messagesService) {
        this.prisma = prisma;
        this.messagesService = messagesService;
    }
    async whatsappSentimentByTopic() {
        const messages = await this.prisma.message.findMany({
            where: { platform: 'whatsapp', direction: 'inbound' },
            select: { id: true, content: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const topicMap = {};
        for (const msg of messages) {
            const intent = await this.messagesService.classifyIntent(msg.content);
            if (!topicMap[intent]) {
                topicMap[intent] = { positive: 0, negative: 0, neutral: 0, total: 0 };
            }
            const { mood } = (0, sentiment_util_1.analyzeSentiment)(msg.content);
            topicMap[intent][mood]++;
            topicMap[intent].total++;
        }
        return Object.entries(topicMap).map(([topic, counts]) => ({ topic, ...counts }));
    }
    returningCustomers() {
        return [];
    }
    async whatsappSentimentAnalytics() {
        const messages = await this.prisma.message.findMany({
            where: { platform: 'whatsapp', direction: 'inbound' },
            select: { id: true, content: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const moodCounts = { positive: 0, negative: 0, neutral: 0 };
        const moodSamples = { positive: [], negative: [], neutral: [] };
        for (const msg of messages) {
            const { mood } = (0, sentiment_util_1.analyzeSentiment)(msg.content);
            moodCounts[mood]++;
            if (moodSamples[mood].length < 3) {
                moodSamples[mood].push({ content: msg.content, createdAt: msg.createdAt });
            }
        }
        const total = messages.length || 1;
        return {
            distribution: {
                positive: Math.round((moodCounts.positive / total) * 100),
                negative: Math.round((moodCounts.negative / total) * 100),
                neutral: Math.round((moodCounts.neutral / total) * 100),
            },
            samples: moodSamples,
            total,
        };
    }
    async totalWhatsAppCustomers() {
        return this.prisma.customer.count({
            where: { whatsappId: { not: null } },
        });
    }
    async newWhatsAppCustomersPerDay() {
        return this.prisma.customer.groupBy({
            by: ['createdAt'],
            where: { whatsappId: { not: null } },
            _count: { _all: true },
            orderBy: { createdAt: 'asc' },
        });
    }
    async customersWithBooking() {
        return this.prisma.customer.count({
            where: {
                whatsappId: { not: null },
                bookings: { some: {} },
            },
        });
    }
    async totalInboundWhatsAppMessages() {
        return this.prisma.message.count({
            where: { platform: 'whatsapp', direction: 'inbound' },
        });
    }
    async totalOutboundWhatsAppMessages() {
        return this.prisma.message.count({
            where: { platform: 'whatsapp', direction: 'outbound' },
        });
    }
    async peakChatHours() {
        const result = await this.prisma.$queryRaw `SELECT DATE_PART('hour', "createdAt") as hour, COUNT(*) as count FROM "messages" WHERE platform = 'whatsapp' AND direction = 'inbound' GROUP BY hour ORDER BY hour`;
        return result.map(row => ({
            hour: Number(row.hour),
            count: typeof row.count === 'bigint' ? Number(row.count) : row.count
        }));
    }
    async peakChatDays() {
        const result = await this.prisma.$queryRaw `SELECT TO_CHAR("createdAt", 'Day') as day, COUNT(*) as count FROM "messages" WHERE platform = 'whatsapp' AND direction = 'inbound' GROUP BY day ORDER BY COUNT(*) DESC`;
        return result.map(row => ({
            day: row.day,
            count: typeof row.count === 'bigint' ? Number(row.count) : row.count
        }));
    }
    async whatsappBookingConversionRate() {
        const total = await this.prisma.customer.count({ where: { whatsappId: { not: null } } });
        const withBooking = await this.prisma.customer.count({
            where: { whatsappId: { not: null }, bookings: { some: {} } },
        });
        return total === 0 ? 0 : withBooking / total;
    }
    async bookingStatusCounts() {
        return this.prisma.booking.groupBy({
            by: ['status'],
            _count: { _all: true },
        });
    }
    async aiDisabledFrequency() {
        return this.prisma.customer.count({ where: { aiEnabled: false } });
    }
    async depositRevenue() {
        const result = await this.prisma.payment.aggregate({
            where: { status: 'success' },
            _sum: { amount: true },
        });
        return {
            ...result,
            _sum: {
                amount: result._sum.amount ? Number(result._sum.amount) : 0,
            }
        };
    }
    async aiEnabledVsDisabled() {
        const enabled = await this.prisma.customer.count({ where: { aiEnabled: true } });
        const disabled = await this.prisma.customer.count({ where: { aiEnabled: false } });
        return { enabled, disabled };
    }
    async whatsappSentimentTrend() {
        const messages = await this.prisma.message.findMany({
            where: { platform: 'whatsapp', direction: 'inbound' },
            select: { id: true, content: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: 500,
        });
        const trend = {};
        for (const msg of messages) {
            const day = msg.createdAt.toISOString().slice(0, 10);
            if (!trend[day]) {
                trend[day] = { positive: 0, negative: 0, neutral: 0, total: 0 };
            }
            const { mood } = (0, sentiment_util_1.analyzeSentiment)(msg.content);
            trend[day][mood]++;
            trend[day].total++;
        }
        return Object.entries(trend).map(([date, counts]) => ({ date, ...counts }));
    }
    async whatsappMostExtremeMessages() {
        const messages = await this.prisma.message.findMany({
            where: { platform: 'whatsapp', direction: 'inbound' },
            select: { id: true, content: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const scored = messages.map(msg => {
            const sentiment = (0, sentiment_util_1.analyzeSentiment)(msg.content);
            return { ...msg, ...sentiment };
        });
        const sorted = [...scored].sort((a, b) => b.score - a.score);
        return {
            mostPositive: sorted.slice(0, 3),
            mostNegative: sorted.slice(-3).reverse(),
        };
    }
    async whatsappKeywordTrends() {
        const messages = await this.prisma.message.findMany({
            where: { platform: 'whatsapp', direction: 'inbound' },
            select: { id: true, content: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const keywordCounts = {};
        for (const msg of messages) {
            const keywords = keyword_extractor.extract(msg.content, { language: 'english', remove_digits: true, return_changed_case: true, remove_duplicates: true });
            for (const kw of keywords) {
                keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
            }
        }
        return Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([keyword, count]) => ({ keyword, count }));
    }
    async whatsappAgentAIPerformance() {
        const messages = await this.prisma.message.findMany({
            where: { platform: 'whatsapp', direction: 'inbound' },
            select: { id: true, content: true, createdAt: true, handledBy: true, isResolved: true, isEscalated: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const stats = {
            agent: { count: 0, positive: 0, negative: 0, neutral: 0, resolved: 0, escalated: 0 },
            ai: { count: 0, positive: 0, negative: 0, neutral: 0, resolved: 0, escalated: 0 },
        };
        for (const msg of messages) {
            const who = msg.handledBy === 'agent' ? 'agent' : 'ai';
            stats[who].count++;
            const { mood } = (0, sentiment_util_1.analyzeSentiment)(msg.content);
            stats[who][mood]++;
            if (msg.isResolved)
                stats[who].resolved++;
            if (msg.isEscalated)
                stats[who].escalated++;
        }
        const format = (s) => ({
            ...s,
            sentiment: {
                positive: s.count ? Math.round((s.positive / s.count) * 100) : 0,
                negative: s.count ? Math.round((s.negative / s.count) * 100) : 0,
                neutral: s.count ? Math.round((s.neutral / s.count) * 100) : 0,
            },
            resolutionRate: s.count ? Math.round((s.resolved / s.count) * 100) : 0,
            escalationRate: s.count ? Math.round((s.escalated / s.count) * 100) : 0,
        });
        return {
            agent: format(stats.agent),
            ai: format(stats.ai),
        };
    }
    async aiPerformanceMetrics() {
        const predictions = await this.prisma.aiPrediction.findMany({
            orderBy: { timestamp: 'desc' },
            take: 1000,
        });
        const labeled = predictions.filter(p => p.actual !== null && p.actual !== undefined);
        let tp = 0, fp = 0, fn = 0, tn = 0;
        for (const p of labeled) {
            if (p.prediction === 'positive' && p.actual === 'positive')
                tp++;
            else if (p.prediction === 'positive' && p.actual !== 'positive')
                fp++;
            else if (p.prediction !== 'positive' && p.actual === 'positive')
                fn++;
            else
                tn++;
        }
        const accuracy = labeled.length ? (tp + tn) / labeled.length : null;
        const precision = tp + fp ? tp / (tp + fp) : null;
        const recall = tp + fn ? tp / (tp + fn) : null;
        const f1 = precision && recall && (precision + recall) ? 2 * (precision * recall) / (precision + recall) : null;
        const avgResponseTime = predictions.length ? Math.round(predictions.reduce((sum, p) => sum + (p.responseTime || 0), 0) / predictions.length) : null;
        const errorCount = predictions.filter(p => !!p.error).length;
        const errorRate = predictions.length ? errorCount / predictions.length : null;
        const feedbacks = predictions.filter(p => typeof p.userFeedback === 'number');
        const avgFeedback = feedbacks.length ? Math.round(feedbacks.reduce((sum, p) => sum + (p.userFeedback || 0), 0) / feedbacks.length * 10) / 10 : null;
        return {
            accuracy,
            precision,
            recall,
            f1,
            avgResponseTime,
            errorRate,
            avgFeedback,
            total: predictions.length,
            labeled: labeled.length,
        };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => messages_service_1.MessagesService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messages_service_1.MessagesService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map