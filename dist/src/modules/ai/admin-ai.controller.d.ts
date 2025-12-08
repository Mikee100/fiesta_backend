import { AiSettingsService } from './ai-settings.service';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
import { ConversationLearningService } from './services/conversation-learning.service';
import { FeedbackLoopService } from './services/feedback-loop.service';
import { PredictiveAnalyticsService } from './services/predictive-analytics.service';
import { DomainExpertiseService } from './services/domain-expertise.service';
import { ProactiveOutreachService } from './services/proactive-outreach.service';
export declare class AdminAiController {
    private aiSettingsService;
    private messagesService;
    private customersService;
    private conversationLearning?;
    private feedbackLoop?;
    private predictiveAnalytics?;
    private domainExpertise?;
    private proactiveOutreach?;
    constructor(aiSettingsService: AiSettingsService, messagesService: MessagesService, customersService: CustomersService, conversationLearning?: ConversationLearningService, feedbackLoop?: FeedbackLoopService, predictiveAnalytics?: PredictiveAnalyticsService, domainExpertise?: DomainExpertiseService, proactiveOutreach?: ProactiveOutreachService);
    toggleAi(enabled: boolean): Promise<{
        success: boolean;
        aiEnabled: boolean;
    }>;
    sendManualReminder(body: {
        customerId: string;
        bookingId?: string;
        message: string;
    }): Promise<{
        success: boolean;
    }>;
    getLearningInsights(days?: number): Promise<{
        error: string;
        success?: undefined;
        insights?: undefined;
    } | {
        success: boolean;
        insights: {
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
        };
        error?: undefined;
    }>;
    getImprovementReport(days?: number): Promise<{
        error: string;
        success?: undefined;
        report?: undefined;
    } | {
        success: boolean;
        report: {
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
        };
        error?: undefined;
    }>;
    triggerAutoImprovement(): Promise<{
        error: string;
        success?: undefined;
        result?: undefined;
    } | {
        success: boolean;
        result: {
            faqsAdded: number;
            satisfactionRate: number;
            recommendations: string[];
        };
        error?: undefined;
    }>;
    getAnalyticsDashboard(): Promise<{
        error: string;
        success?: undefined;
        dashboard?: undefined;
    } | {
        success: boolean;
        dashboard: {
            totalCustomers: number;
            activeCustomers: number;
            totalBookings: number;
            avgLeadScore: number;
            highValueCustomers: number;
            churnRiskCustomers: number;
            conversionRate: number;
        };
        error?: undefined;
    }>;
    getLeadScore(customerId: string): Promise<{
        error: string;
        success?: undefined;
        leadScore?: undefined;
    } | {
        success: boolean;
        leadScore: number;
        error?: undefined;
    }>;
    getChurnRisk(customerId: string): Promise<{
        error: string;
        success?: undefined;
        churnRisk?: undefined;
    } | {
        success: boolean;
        churnRisk: {
            risk: "low" | "medium" | "high";
            score: number;
            reasons: string[];
        };
        error?: undefined;
    }>;
    getUpsellOpportunities(customerId: string): Promise<{
        error: string;
        success?: undefined;
        opportunities?: undefined;
    } | {
        success: boolean;
        opportunities: {
            opportunities: string[];
            recommendedPackages: string[];
            confidence: number;
        };
        error?: undefined;
    }>;
    seedDomainKnowledge(): Promise<{
        error: string;
        success?: undefined;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        error?: undefined;
    }>;
    collectFeedback(body: {
        predictionId: number;
        thumbsUp?: boolean;
        rating?: number;
        comment?: string;
        wasHelpful?: boolean;
        wasAccurate?: boolean;
        wasEmpathetic?: boolean;
    }): Promise<{
        error: string;
        success?: undefined;
        feedback?: undefined;
    } | {
        success: boolean;
        feedback: {
            id: string;
            createdAt: Date;
            predictionId: number;
            thumbsUp: boolean | null;
            rating: number | null;
            comment: string | null;
            wasHelpful: boolean | null;
            wasAccurate: boolean | null;
            wasEmpathetic: boolean | null;
            improvementSuggestion: string | null;
        };
        error?: undefined;
    }>;
    triggerAbandonedBookings(): Promise<{
        error: string;
        success?: undefined;
        scheduled?: undefined;
    } | {
        success: boolean;
        scheduled: number;
        error?: undefined;
    }>;
    triggerPostShootFollowups(): Promise<{
        error: string;
        success?: undefined;
        sent?: undefined;
    } | {
        success: boolean;
        sent: number;
        error?: undefined;
    }>;
    triggerReengagement(): Promise<{
        error: string;
        success?: undefined;
        reengaged?: undefined;
    } | {
        success: boolean;
        reengaged: number;
        error?: undefined;
    }>;
    triggerMilestones(): Promise<{
        error: string;
        success?: undefined;
        celebrated?: undefined;
    } | {
        success: boolean;
        celebrated: number;
        error?: undefined;
    }>;
    getOutreachStats(days?: number): Promise<{
        error: string;
        success?: undefined;
        stats?: undefined;
    } | {
        success: boolean;
        stats: {
            total: number;
            sent: number;
            pending: number;
            failed: number;
            responseRate: number;
            byType: Record<string, number>;
        };
        error?: undefined;
    }>;
    scheduleCustomOutreach(body: {
        customerId: string;
        type: string;
        message: string;
        scheduledFor?: string;
    }): Promise<{
        error: string;
        success?: undefined;
        outreach?: undefined;
    } | {
        success: boolean;
        outreach: {
            id: string;
            customerId: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            type: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            scheduledFor: Date;
            sentAt: Date | null;
            deliveredAt: Date | null;
            messageContent: string;
            channel: string;
            campaignId: string | null;
            responseReceived: boolean;
        };
        error?: undefined;
    }>;
}
