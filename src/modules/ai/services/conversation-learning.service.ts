// src/modules/ai/services/conversation-learning.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

interface LearningEntry {
    userMessage: string;
    aiResponse: string;
    extractedIntent: string;
    emotionalTone?: string;
    wasSuccessful: boolean;
    conversationOutcome?: string;
    conversationLength?: number;
    timeToResolution?: number;
}

@Injectable()
export class ConversationLearningService {
    private readonly logger = new Logger(ConversationLearningService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Record a learning entry from conversation
     */
    async recordLearning(customerId: string, entry: LearningEntry, conversationId?: string) {
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

    /**
     * Mark conversation for knowledge base extraction
     */
    async markForKBExtraction(learningId: string, category: string, extractedKnowledge: string) {
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

    /**
     * Get successful conversation patterns for an intent
     */
    async getSuccessfulPatterns(intent: string, limit = 10) {
        return this.prisma.conversationLearning.findMany({
            where: {
                extractedIntent: intent,
                wasSuccessful: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Get failed conversations to learn from
     */
    async getFailedConversations(intent?: string, limit = 20) {
        const where: any = { wasSuccessful: false };
        if (intent) where.extractedIntent = intent;

        return this.prisma.conversationLearning.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Analyze conversation patterns and extract insights
     */
    async analyzePatterns(intent: string) {
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

    /**
     * Extract new FAQ entries from successful conversations
     */
    async extractPotentialFAQs(minOccurrences = 3) {
        // Find questions that appear multiple times with successful outcomes
        const learnings = await this.prisma.conversationLearning.findMany({
            where: {
                wasSuccessful: true,
                shouldAddToKB: false, // Not already processed
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        // Group similar questions
        const questionGroups = new Map<string, any[]>();

        learnings.forEach(learning => {
            const normalizedQuestion = this.normalizeQuestion(learning.userMessage);
            if (!questionGroups.has(normalizedQuestion)) {
                questionGroups.set(normalizedQuestion, []);
            }
            questionGroups.get(normalizedQuestion)!.push(learning);
        });

        // Find questions that appear frequently
        const potentialFAQs: any[] = [];
        questionGroups.forEach((group, question) => {
            if (group.length >= minOccurrences) {
                // Get most common successful response
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

    /**
     * Get learning insights for analytics dashboard
     */
    async getLearningInsights(days = 30) {
        const since = new Date();
        since.setDate(since.getDate() - days);

        const learnings = await this.prisma.conversationLearning.findMany({
            where: { createdAt: { gte: since } },
        });

        const byIntent = new Map<string, { successful: number; failed: number }>();
        const byEmotionalTone = new Map<string, number>();
        const byOutcome = new Map<string, number>();

        learnings.forEach(learning => {
            // By intent
            if (!byIntent.has(learning.extractedIntent)) {
                byIntent.set(learning.extractedIntent, { successful: 0, failed: 0 });
            }
            const intentStats = byIntent.get(learning.extractedIntent)!;
            if (learning.wasSuccessful) intentStats.successful++;
            else intentStats.failed++;

            // By emotional tone
            if (learning.detectedEmotionalTone) {
                byEmotionalTone.set(
                    learning.detectedEmotionalTone,
                    (byEmotionalTone.get(learning.detectedEmotionalTone) || 0) + 1
                );
            }

            // By outcome
            if (learning.conversationOutcome) {
                byOutcome.set(
                    learning.conversationOutcome,
                    (byOutcome.get(learning.conversationOutcome) || 0) + 1
                );
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

    /**
     * Auto-improve knowledge base from learnings
     */
    async autoImproveKnowledgeBase() {
        const potentialFAQs = await this.extractPotentialFAQs(3);
        let added = 0;

        for (const faq of potentialFAQs) {
            // Check if similar question already exists
            const existing = await this.prisma.knowledgeBase.findFirst({
                where: {
                    question: { contains: faq.question.substring(0, 50), mode: 'insensitive' },
                },
            });

            if (!existing && faq.avgSuccessRate > 0.8) {
                // Add to knowledge base
                await this.prisma.knowledgeBase.create({
                    data: {
                        question: faq.question,
                        answer: faq.answer,
                        category: faq.category,
                        embedding: [], // Will be populated by embedding service
                    },
                });
                added++;
                this.logger.log(`Auto-added FAQ: "${faq.question.substring(0, 50)}..."`);
            }
        }

        this.logger.log(`Auto-improvement complete: Added ${added} new FAQ entries`);
        return { added, total: potentialFAQs.length };
    }

    // Helper methods
    private calculateAverage(numbers: (number | null)[]): number {
        const valid = numbers.filter(n => n !== null) as number[];
        if (valid.length === 0) return 0;
        return valid.reduce((sum, n) => sum + n, 0) / valid.length;
    }

    private getCommonValues(values: string[]): string[] {
        const counts = new Map<string, number>();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([value]) => value);
    }

    private getMostCommon(values: string[]): string {
        const counts = new Map<string, number>();
        values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])[0][0];
    }

    private normalizeQuestion(question: string): string {
        return question
            .toLowerCase()
            .replace(/[?!.,]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

    private analyzeFailures(failed: any[]): string[] {
        // Simple heuristic: look for common patterns in failed conversations
        const patterns: string[] = [];

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
}
