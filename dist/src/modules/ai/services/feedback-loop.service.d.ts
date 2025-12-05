import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationLearningService } from './conversation-learning.service';
export declare class FeedbackLoopService {
    private prisma;
    private conversationLearning;
    private readonly logger;
    constructor(prisma: PrismaService, conversationLearning: ConversationLearningService);
    collectFeedback(predictionId: number, feedback: {
        thumbsUp?: boolean;
        rating?: number;
        comment?: string;
        wasHelpful?: boolean;
        wasAccurate?: boolean;
        wasEmpathetic?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        thumbsUp: boolean | null;
        rating: number | null;
        comment: string | null;
        wasHelpful: boolean | null;
        wasAccurate: boolean | null;
        wasEmpathetic: boolean | null;
        improvementSuggestion: string | null;
        predictionId: number;
    }>;
    private triggerImprovement;
    generateImprovementReport(days?: number): Promise<{
        period: string;
        totalFeedback: number;
        positiveFeedback: number;
        negativeFeedback: number;
        satisfactionRate: number;
        avgRating: number;
        issues: {
            unhelpful: number;
            inaccurate: number;
            unempathetic: number;
        };
        topIssues: string[];
        recommendations: string[];
    }>;
    private identifyTopIssues;
    private generateRecommendations;
    autoTriggerImprovements(): Promise<{
        faqsAdded: number;
        satisfactionRate: number;
        recommendations: string[];
    }>;
    trackABTest(variant: string, predictionId: number, wasSuccessful: boolean): Promise<void>;
}
