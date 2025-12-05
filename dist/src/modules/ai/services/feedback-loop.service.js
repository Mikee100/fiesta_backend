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
var FeedbackLoopService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackLoopService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const conversation_learning_service_1 = require("./conversation-learning.service");
let FeedbackLoopService = FeedbackLoopService_1 = class FeedbackLoopService {
    constructor(prisma, conversationLearning) {
        this.prisma = prisma;
        this.conversationLearning = conversationLearning;
        this.logger = new common_1.Logger(FeedbackLoopService_1.name);
    }
    async collectFeedback(predictionId, feedback) {
        const responseFeedback = await this.prisma.responseFeedback.create({
            data: {
                predictionId,
                ...feedback,
            },
        });
        this.logger.log(`Collected feedback for prediction ${predictionId}: ${feedback.thumbsUp ? '👍' : '👎'}`);
        if (feedback.thumbsUp === false || (feedback.rating && feedback.rating < 3)) {
            await this.triggerImprovement(predictionId);
        }
        return responseFeedback;
    }
    async triggerImprovement(predictionId) {
        const prediction = await this.prisma.aiPrediction.findUnique({
            where: { id: predictionId },
        });
        if (!prediction)
            return;
        this.logger.warn(`Triggering improvement for failed prediction: "${prediction.input}"`);
        await this.prisma.conversationLearning.create({
            data: {
                customerId: 'system',
                userMessage: prediction.input,
                aiResponse: prediction.prediction,
                extractedIntent: 'unknown',
                wasSuccessful: false,
                conversationOutcome: 'negative_feedback',
                shouldAddToKB: true,
            },
        });
    }
    async generateImprovementReport(days = 7) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const feedbacks = await this.prisma.responseFeedback.findMany({
            where: {
                createdAt: { gte: since },
            },
            include: {
                prediction: true,
            },
        });
        const totalFeedback = feedbacks.length;
        const positiveFeedback = feedbacks.filter(f => f.thumbsUp === true).length;
        const negativeFeedback = feedbacks.filter(f => f.thumbsUp === false).length;
        const avgRating = feedbacks
            .filter(f => f.rating !== null)
            .reduce((sum, f) => sum + (f.rating || 0), 0) / feedbacks.filter(f => f.rating).length || 0;
        const unhelpfulResponses = feedbacks.filter(f => f.wasHelpful === false);
        const inaccurateResponses = feedbacks.filter(f => f.wasAccurate === false);
        const unempatheticResponses = feedbacks.filter(f => f.wasEmpathetic === false);
        const report = {
            period: `Last ${days} days`,
            totalFeedback,
            positiveFeedback,
            negativeFeedback,
            satisfactionRate: totalFeedback > 0 ? positiveFeedback / totalFeedback : 0,
            avgRating,
            issues: {
                unhelpful: unhelpfulResponses.length,
                inaccurate: inaccurateResponses.length,
                unempathetic: unempatheticResponses.length,
            },
            topIssues: this.identifyTopIssues(feedbacks),
            recommendations: this.generateRecommendations(feedbacks),
        };
        this.logger.log(`Improvement report generated: ${(report.satisfactionRate * 100).toFixed(1)}% satisfaction`);
        return report;
    }
    identifyTopIssues(feedbacks) {
        const issues = [];
        const negativeFeedbacks = feedbacks.filter(f => f.thumbsUp === false || (f.rating && f.rating < 3));
        if (negativeFeedbacks.length === 0)
            return [];
        const intentMap = new Map();
        negativeFeedbacks.forEach(f => {
            const input = f.prediction.input.toLowerCase();
            const keywords = input.match(/\b(book|package|price|reschedule|cancel|when|what|how)\b/g) || [];
            keywords.forEach(kw => {
                intentMap.set(kw, (intentMap.get(kw) || 0) + 1);
            });
        });
        const sorted = Array.from(intentMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
        sorted.forEach(([keyword, count]) => {
            issues.push(`${count} issues related to "${keyword}" queries`);
        });
        return issues;
    }
    generateRecommendations(feedbacks) {
        const recommendations = [];
        const negativeFeedbacks = feedbacks.filter(f => f.thumbsUp === false);
        if (negativeFeedbacks.length === 0) {
            recommendations.push('Great job! Keep maintaining current quality standards.');
            return recommendations;
        }
        const unhelpfulCount = feedbacks.filter(f => f.wasHelpful === false).length;
        const inaccurateCount = feedbacks.filter(f => f.wasAccurate === false).length;
        const unempatheticCount = feedbacks.filter(f => f.wasEmpathetic === false).length;
        if (unhelpfulCount > feedbacks.length * 0.2) {
            recommendations.push('Improve response helpfulness - consider adding more actionable information');
        }
        if (inaccurateCount > feedbacks.length * 0.15) {
            recommendations.push('Review knowledge base accuracy - some responses may contain outdated information');
        }
        if (unempatheticCount > feedbacks.length * 0.15) {
            recommendations.push('Enhance emotional intelligence - responses may need more empathy and warmth');
        }
        if (negativeFeedbacks.length > feedbacks.length * 0.3) {
            recommendations.push('High negative feedback rate - consider reviewing conversation flows');
        }
        return recommendations;
    }
    async autoTriggerImprovements() {
        this.logger.log('Running auto-improvement process...');
        const result = await this.conversationLearning.autoImproveKnowledgeBase();
        const report = await this.generateImprovementReport(7);
        this.logger.log(`Auto-improvement complete: Added ${result.added} FAQs, Satisfaction: ${(report.satisfactionRate * 100).toFixed(1)}%`);
        return {
            faqsAdded: result.added,
            satisfactionRate: report.satisfactionRate,
            recommendations: report.recommendations,
        };
    }
    async trackABTest(variant, predictionId, wasSuccessful) {
        await this.prisma.aiPrediction.update({
            where: { id: predictionId },
            data: {
                modelVersion: `${variant}`,
            },
        });
        this.logger.debug(`A/B test tracked: variant=${variant}, success=${wasSuccessful}`);
    }
};
exports.FeedbackLoopService = FeedbackLoopService;
exports.FeedbackLoopService = FeedbackLoopService = FeedbackLoopService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        conversation_learning_service_1.ConversationLearningService])
], FeedbackLoopService);
//# sourceMappingURL=feedback-loop.service.js.map