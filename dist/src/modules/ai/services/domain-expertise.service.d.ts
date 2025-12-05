import { PrismaService } from '../../../prisma/prisma.service';
interface RecommendationCriteria {
    budget?: number;
    outfitCount?: number;
    wantsMakeup?: boolean;
    wantsStyling?: boolean;
    preferredType?: 'studio' | 'outdoor';
    isReturning?: boolean;
}
export declare class DomainExpertiseService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getBestPractices(): {
        optimalWeeks: {
            min: number;
            max: number;
            explanation: string;
        };
        outfitGuidance: {
            recommended: string[];
            avoid: string[];
            tip: string;
        };
        comfortTips: string[];
        partnerInvolvement: string;
        timingAdvice: string;
    };
    handleObjection(objection: string, context?: any): string;
    recommendPackages(criteria: RecommendationCriteria): Promise<any[]>;
    getSeasonalAdvice(month?: number): string;
    getUpsellSuggestions(currentPackage: string): string[];
    answerDomainQuestion(question: string): Promise<string | null>;
    seedDomainKnowledge(): Promise<void>;
}
export {};
