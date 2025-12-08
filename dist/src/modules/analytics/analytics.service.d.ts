import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
export declare class AnalyticsService {
    private prisma;
    private messagesService;
    constructor(prisma: PrismaService, messagesService: MessagesService);
    whatsappSentimentByTopic(): Promise<{
        positive: number;
        negative: number;
        neutral: number;
        total: number;
        topic: string;
    }[]>;
    returningCustomers(): any[];
    whatsappSentimentAnalytics(): Promise<{
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
    aiEnabledVsDisabled(): Promise<{
        enabled: number;
        disabled: number;
    }>;
    whatsappSentimentTrend(): Promise<{
        positive: number;
        negative: number;
        neutral: number;
        total: number;
        date: string;
    }[]>;
    whatsappMostExtremeMessages(): Promise<{
        mostPositive: {
            mood: "positive" | "negative" | "neutral";
            score: any;
            comparative: any;
            id: string;
            createdAt: Date;
            content: string;
        }[];
        mostNegative: {
            mood: "positive" | "negative" | "neutral";
            score: any;
            comparative: any;
            id: string;
            createdAt: Date;
            content: string;
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
        avgResponseTimeMs: number;
        p50ResponseTimeMs: number;
        p95ResponseTimeMs: number;
        p99ResponseTimeMs: number;
        totalConversations: number;
        bookingConversionRate: number;
        customersWithBooking: number;
        totalCustomers: number;
        smartActionsTriggered: number;
        packageQueriesHandled: number;
        avgMessagesPerConversation: number;
        totalInbound: number;
        totalOutbound: number;
        topIntents: {
            intent: string;
            count: number;
        }[];
        customerSatisfactionScore: number;
        positiveSentiment: number;
        negativeSentiment: number;
        periodDays: number;
        lastUpdated: string;
    }>;
    getBusinessKPIs(startDate?: Date, endDate?: Date): Promise<{
        revenue: {
            total: number;
            count: number;
        };
        avgBookingValue: number;
        conversionRate: {
            rate: number;
            totalCustomers: number;
            convertedCustomers: number;
        };
        popularPackages: {
            package: string;
            bookings: number;
        }[];
        customerMetrics: {
            totalCustomers: number;
            customersWithBookings: number;
            repeatCustomers: number;
            repeatRate: number;
            newCustomersThisMonth: number;
        };
        period: {
            start: Date;
            end: Date;
        };
    }>;
    getTotalRevenue(startDate?: Date, endDate?: Date): Promise<{
        total: number;
        count: number;
    }>;
    getAverageBookingValue(startDate?: Date, endDate?: Date): Promise<number>;
    getRevenueByPackage(startDate?: Date, endDate?: Date): Promise<{
        package: string;
        revenue: number;
        bookings: number;
        avgValue: number;
    }[]>;
    getMonthlyRevenue(months?: number): Promise<{
        month: any;
        revenue: number;
        bookings: number;
    }[]>;
    getConversionRate(): Promise<{
        rate: number;
        totalCustomers: number;
        convertedCustomers: number;
    }>;
    getPopularPackages(startDate?: Date, endDate?: Date): Promise<{
        package: string;
        bookings: number;
    }[]>;
    getPopularTimeSlots(): Promise<{
        hour: number;
        dayOfWeek: number;
        count: number;
    }[]>;
    getSeasonalTrends(): Promise<{
        month: string;
        currentYear: number;
        lastYear: number;
    }[]>;
    getCustomerLifetimeValue(): Promise<{
        clv: number;
        avgBookingsPerCustomer: number;
        avgBookingValue: number;
        repeatRate: number;
        totalCustomers: number;
        customersWithBookings: number;
        repeatCustomers: number;
    }>;
    getCustomerMetrics(): Promise<{
        totalCustomers: number;
        customersWithBookings: number;
        repeatCustomers: number;
        repeatRate: number;
        newCustomersThisMonth: number;
    }>;
    getYearOverYearGrowth(): Promise<{
        currentYear: number;
        lastYear: number;
        growth: number;
        trend: string;
    }>;
}
