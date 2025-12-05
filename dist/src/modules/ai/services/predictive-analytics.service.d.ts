import { PrismaService } from '../../../prisma/prisma.service';
export declare class PredictiveAnalyticsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    calculateLeadScore(customerId: string): Promise<number>;
    predictChurnRisk(customerId: string): Promise<{
        risk: 'low' | 'medium' | 'high';
        score: number;
        reasons: string[];
    }>;
    identifyUpsellOpportunities(customerId: string): Promise<{
        opportunities: string[];
        recommendedPackages: string[];
        confidence: number;
    }>;
    predictBestFollowUpTime(customerId: string): Promise<{
        time: Date;
        confidence: number;
    }>;
    generateDashboard(): Promise<{
        totalCustomers: number;
        activeCustomers: number;
        totalBookings: number;
        avgLeadScore: number;
        highValueCustomers: number;
        churnRiskCustomers: number;
        conversionRate: number;
    }>;
    private getMostCommonValue;
    private calculateAverageLeadScore;
    private getHighValueCustomers;
    private getChurnRiskCustomers;
}
