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
var ConversationLearningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationLearningService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let ConversationLearningService = ConversationLearningService_1 = class ConversationLearningService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ConversationLearningService_1.name);
    }
    async recordLearning(customerId, entry, conversationId) {
        const learning = await this.prisma.conversationLearning.create({
            data: {
                customerId,
                conversationId,
                userMessage: entry.userMessage,
                aiResponse: entry.aiResponse,
                extractedIntent: entry.extractedIntent,
                detectedEmotionalTone: entry.emotionalTone,
                wasSuccessful: entry.wasSuccessful,
                conversationOutcome: entry.conversationOutcome,
                conversationLength: entry.conversationLength || 1,
                timeToResolution: entry.timeToResolution,
            },
        });
        this.logger.debug(`Recorded learning for customer ${customerId}, intent: ${entry.extractedIntent}`);
        return learning;
    }
    async markForKBExtraction(learningId, category, extractedKnowledge) {
        await this.prisma.conversationLearning.update({
            where: { id: learningId },
            data: {
                shouldAddToKB: true,
                category,
                newKnowledgeExtracted: extractedKnowledge,
            },
        });
        this.logger.log(`Marked learning ${learningId} for KB extraction in category: ${category}`);
    }
    async getSuccessfulPatterns(intent, limit = 10) {
        return this.prisma.conversationLearning.findMany({
            where: {
                extractedIntent: intent,
                wasSuccessful: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
    async getFailedConversations(intent, limit = 20) {
        const where = { wasSuccessful: false };
        if (intent)
            where.extractedIntent = intent;
        return this.prisma.conversationLearning.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
    async analyzePatterns(intent) {
        const successful = await this.getSuccessfulPatterns(intent, 50);
        const failed = await this.getFailedConversations(intent, 50);
        const analysis = {
            intent,
            totalSuccessful: successful.length,
            totalFailed: failed.length,
            successRate: successful.length / (successful.length + failed.length),
            avgTimeToResolution: this.calculateAverage(successful.map(s => s.timeToResolution).filter(Boolean)),
            avgConversationLength: this.calculateAverage(successful.map(s => s.conversationLength)),
            commonEmotionalTones: this.getCommonValues(successful.map(s => s.detectedEmotionalTone).filter(Boolean)),
            commonFailureReasons: this.analyzeFailures(failed),
        };
        this.logger.log(`Pattern analysis for intent "${intent}": ${analysis.successRate * 100}% success rate`);
        return analysis;
    }
    async extractPotentialFAQs(minOccurrences = 3) {
        const learnings = await this.prisma.conversationLearning.findMany({
            where: {
                wasSuccessful: true,
                shouldAddToKB: false,
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const questionGroups = new Map();
        learnings.forEach(learning => {
            const normalizedQuestion = this.normalizeQuestion(learning.userMessage);
            if (!questionGroups.has(normalizedQuestion)) {
                questionGroups.set(normalizedQuestion, []);
            }
            questionGroups.get(normalizedQuestion).push(learning);
        });
        const potentialFAQs = [];
        questionGroups.forEach((group, question) => {
            if (group.length >= minOccurrences) {
                const responses = group.map(g => g.aiResponse);
                const mostCommonResponse = this.getMostCommon(responses);
                potentialFAQs.push({
                    question,
                    answer: mostCommonResponse,
                    occurrences: group.length,
                    category: group[0].category || 'general',
                    avgSuccessRate: group.filter(g => g.wasSuccessful).length / group.length,
                });
            }
        });
        this.logger.log(`Extracted ${potentialFAQs.length} potential FAQ entries`);
        return potentialFAQs.sort((a, b) => b.occurrences - a.occurrences);
    }
    async getLearningInsights(days = 30) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const learnings = await this.prisma.conversationLearning.findMany({
            where: { createdAt: { gte: since } },
        });
        const byIntent = new Map();
        const byEmotionalTone = new Map();
        const byOutcome = new Map();
        learnings.forEach(learning => {
            if (!byIntent.has(learning.extractedIntent)) {
                byIntent.set(learning.extractedIntent, { successful: 0, failed: 0 });
            }
            const intentStats = byIntent.get(learning.extractedIntent);
            if (learning.wasSuccessful)
                intentStats.successful++;
            else
                intentStats.failed++;
            if (learning.detectedEmotionalTone) {
                byEmotionalTone.set(learning.detectedEmotionalTone, (byEmotionalTone.get(learning.detectedEmotionalTone) || 0) + 1);
            }
            if (learning.conversationOutcome) {
                byOutcome.set(learning.conversationOutcome, (byOutcome.get(learning.conversationOutcome) || 0) + 1);
            }
        });
        return {
            totalConversations: learnings.length,
            overallSuccessRate: learnings.filter(l => l.wasSuccessful).length / learnings.length,
            intentBreakdown: Object.fromEntries(byIntent),
            emotionalToneBreakdown: Object.fromEntries(byEmotionalTone),
            outcomeBreakdown: Object.fromEntries(byOutcome),
            avgTimeToResolution: this.calculateAverage(learnings.map(l => l.timeToResolution).filter(Boolean)),
            avgConversationLength: this.calculateAverage(learnings.map(l => l.conversationLength)),
        };
    }
    async autoImproveKnowledgeBase() {
        const potentialFAQs = await this.extractPotentialFAQs(3);
        let added = 0;
        for (const faq of potentialFAQs) {
            const existing = await this.prisma.knowledgeBase.findFirst({
                where: {
                    question: { contains: faq.question.substring(0, 50), mode: 'insensitive' },
                },
            });
            if (!existing && faq.avgSuccessRate > 0.8) {
                await this.prisma.knowledgeBase.create({
                    data: {
                        question: faq.question,
                        answer: faq.answer,
                        category: faq.category,
                        embedding: [],
                    },
                });
                added++;
                this.logger.log(`Auto-added FAQ: "${faq.question.substring(0, 50)}..."`);
            }
        }
        this.logger.log(`Auto-improvement complete: Added ${added} new FAQ entries`);
        return { added, total: potentialFAQs.length };
    }
    calculateAverage(numbers) {
        const valid = numbers.filter(n => n !== null);
        if (valid.length === 0)
            return 0;
        return valid.reduce((sum, n) => sum + n, 0) / valid.length;
    }
    getCommonValues(values) {
        const counts = new Map();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([value]) => value);
    }
    getMostCommon(values) {
        const counts = new Map();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])[0][0];
    }
    normalizeQuestion(question) {
        return question
            .toLowerCase()
            .replace(/[?!.,]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }
    analyzeFailures(failed) {
        const patterns = [];
        const shortConversations = failed.filter(f => f.conversationLength < 3).length;
        if (shortConversations > failed.length * 0.3) {
            patterns.push('Many failures in short conversations - may need better initial responses');
        }
        const longConversations = failed.filter(f => f.conversationLength > 10).length;
        if (longConversations > failed.length * 0.3) {
            patterns.push('Many failures in long conversations - may indicate confusion or stuck loops');
        }
        return patterns;
    }
};
exports.ConversationLearningService = ConversationLearningService;
exports.ConversationLearningService = ConversationLearningService = ConversationLearningService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ConversationLearningService);
//# sourceMappingURL=conversation-learning.service.js.map