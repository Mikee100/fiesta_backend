import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    whatsappSentimentTrend(): Promise<{
        positive: number;
        negative: number;
        neutral: number;
        total: number;
        date: string;
    }[]>;
    whatsappSentiment(): Promise<{
        distribution: {
            positive: number;
            negative: number;
            neutral: number;
        };
        samples: {
            positive: any[];
            negative: any[];
            neutral: any[];
        };
        total: number;
    }>;
    totalWhatsAppCustomers(): Promise<number>;
    newWhatsAppCustomersPerDay(): Promise<(import(".prisma/client").Prisma.PickEnumerable<import(".prisma/client").Prisma.CustomerGroupByOutputType, "createdAt"[]> & {
        _count: {
            _all: number;
        };
    })[]>;
    returningCustomers(): any[];
    aiEnabledVsDisabled(): Promise<{
        enabled: number;
        disabled: number;
    }>;
    customersWithBooking(): Promise<number>;
    totalInboundWhatsAppMessages(): Promise<number>;
    totalOutboundWhatsAppMessages(): Promise<number>;
    peakChatHours(): Promise<{
        hour: number;
        count: any;
    }[]>;
    peakChatDays(): Promise<{
        day: any;
        count: any;
    }[]>;
    whatsappBookingConversionRate(): Promise<number>;
    bookingStatusCounts(): Promise<(import(".prisma/client").Prisma.PickEnumerable<import(".prisma/client").Prisma.BookingGroupByOutputType, "status"[]> & {
        _count: {
            _all: number;
        };
    })[]>;
    aiDisabledFrequency(): Promise<number>;
    depositRevenue(): Promise<{
        _sum: {
            amount: number;
        };
    }>;
    whatsappSentimentByTopic(): Promise<{
        positive: number;
        negative: number;
        neutral: number;
        total: number;
        topic: string;
    }[]>;
    whatsappMostExtremeMessages(): Promise<{
        mostPositive: {
            mood: "positive" | "negative" | "neutral";
            score: any;
            comparative: any;
            id: string;
            content: string;
            createdAt: Date;
        }[];
        mostNegative: {
            mood: "positive" | "negative" | "neutral";
            score: any;
            comparative: any;
            id: string;
            content: string;
            createdAt: Date;
        }[];
    }>;
    whatsappKeywordTrends(): Promise<{
        keyword: string;
        count: number;
    }[]>;
    whatsappAgentAIPerformance(): Promise<{
        agent: any;
        ai: any;
    }>;
    aiPerformanceMetrics(): Promise<{
        accuracy: number;
        precision: number;
        recall: number;
        f1: number;
        avgResponseTime: number;
        errorRate: number;
        avgFeedback: number;
        total: number;
        labeled: number;
    }>;
}
