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
export declare class CustomerMemoryService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getOrCreateMemory(customerId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        preferredPackages: string[];
        budgetMin: number | null;
        budgetMax: number | null;
        preferredTimes: string[];
        communicationStyle: string | null;
        relationshipStage: string;
        lifetimeValue: number;
        satisfactionScore: number | null;
        totalBookings: number;
        averageResponseTime: number | null;
        preferredChannel: string | null;
        lastInteractionSummary: string | null;
        conversationSummaries: import("@prisma/client/runtime/library").JsonValue[];
        keyInsights: string[];
    }>;
    updatePreferences(customerId: string, preferences: CustomerPreferences): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        preferredPackages: string[];
        budgetMin: number | null;
        budgetMax: number | null;
        preferredTimes: string[];
        communicationStyle: string | null;
        relationshipStage: string;
        lifetimeValue: number;
        satisfactionScore: number | null;
        totalBookings: number;
        averageResponseTime: number | null;
        preferredChannel: string | null;
        lastInteractionSummary: string | null;
        conversationSummaries: import("@prisma/client/runtime/library").JsonValue[];
        keyInsights: string[];
    }>;
    addConversationSummary(customerId: string, summary: ConversationSummary): Promise<void>;
    updateRelationshipStage(customerId: string, stage: 'new' | 'interested' | 'booked' | 'returning' | 'vip'): Promise<void>;
    addInsight(customerId: string, insight: string): Promise<void>;
    updateLifetimeValue(customerId: string, bookingValue: number): Promise<void>;
    updateSatisfaction(customerId: string, rating: number): Promise<void>;
    getPersonalizationContext(customerId: string): Promise<{
        relationshipStage: string;
        preferredPackages: string[];
        budgetRange: {
            min: number;
            max: number;
        };
        preferredTimes: string[];
        communicationStyle: string;
        lifetimeValue: number;
        totalBookings: number;
        satisfactionScore: number;
        keyInsights: string[];
        lastInteraction: string;
        recentBookings: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            customerId: string;
            service: string;
            dateTime: Date;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
        }[];
        isVIP: boolean;
        isReturning: boolean;
    }>;
    detectCommunicationStyle(messages: string[]): 'brief' | 'detailed' | 'friendly';
    extractPreferredTimes(customerId: string): Promise<string[]>;
}
export {};
