import { ConfigService } from '@nestjs/config';
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
export declare class ConversationLearningService {
    private prisma;
    private configService;
    private readonly logger;
    private readonly openai;
    private readonly enableRealTimeLearning;
    constructor(prisma: PrismaService, configService: ConfigService);
    recordLearning(customerId: string, entry: LearningEntry, conversationId?: string): Promise<{
        id: string;
        category: string | null;
        createdAt: Date;
        customerId: string;
        conversationId: string | null;
        userMessage: string;
        aiResponse: string;
        extractedIntent: string;
        detectedEmotionalTone: string | null;
        wasSuccessful: boolean;
        userFeedbackScore: number | null;
        conversationOutcome: string | null;
        shouldAddToKB: boolean;
        newKnowledgeExtracted: string | null;
        conversationLength: number;
        timeToResolution: number | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    private processRealTimeLearning;
    private considerAddingToKB;
    private analyzeFailurePattern;
    private updateResponsePatterns;
    private scoreKBEntry;
    private similarity;
    markForKBExtraction(learningId: string, category: string, extractedKnowledge: string): Promise<void>;
    getSuccessfulPatterns(intent: string, limit?: number): Promise<{
        id: string;
        category: string | null;
        createdAt: Date;
        customerId: string;
        conversationId: string | null;
        userMessage: string;
        aiResponse: string;
        extractedIntent: string;
        detectedEmotionalTone: string | null;
        wasSuccessful: boolean;
        userFeedbackScore: number | null;
        conversationOutcome: string | null;
        shouldAddToKB: boolean;
        newKnowledgeExtracted: string | null;
        conversationLength: number;
        timeToResolution: number | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    getFailedConversations(intent?: string, limit?: number): Promise<{
        id: string;
        category: string | null;
        createdAt: Date;
        customerId: string;
        conversationId: string | null;
        userMessage: string;
        aiResponse: string;
        extractedIntent: string;
        detectedEmotionalTone: string | null;
        wasSuccessful: boolean;
        userFeedbackScore: number | null;
        conversationOutcome: string | null;
        shouldAddToKB: boolean;
        newKnowledgeExtracted: string | null;
        conversationLength: number;
        timeToResolution: number | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    analyzePatterns(intent: string): Promise<{
        intent: string;
        totalSuccessful: number;
        totalFailed: number;
        successRate: number;
        avgTimeToResolution: number;
        avgConversationLength: number;
        commonEmotionalTones: string[];
        commonFailureReasons: string[];
    }>;
    extractPotentialFAQs(minOccurrences?: number): Promise<any[]>;
    getLearningInsights(days?: number): Promise<{
        totalConversations: number;
        overallSuccessRate: number;
        intentBreakdown: {
            [k: string]: {
                successful: number;
                failed: number;
            };
        };
        emotionalToneBreakdown: {
            [k: string]: number;
        };
        outcomeBreakdown: {
            [k: string]: number;
        };
        avgTimeToResolution: number;
        avgConversationLength: number;
    }>;
    autoImproveKnowledgeBase(): Promise<{
        added: number;
        total: number;
    }>;
    private calculateAverage;
    private getCommonValues;
    private getMostCommon;
    private normalizeQuestion;
    private analyzeFailures;
}
export {};
