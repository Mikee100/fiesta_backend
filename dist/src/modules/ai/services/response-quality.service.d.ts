import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
interface QualityScore {
    helpfulness: number;
    accuracy: number;
    empathy: number;
    clarity: number;
    overall: number;
    issues: string[];
    recommendations: string[];
}
interface ValidationResult {
    passed: boolean;
    score: QualityScore;
    improvedResponse?: string;
    shouldEscalate: boolean;
    reason?: string;
}
export declare class ResponseQualityService {
    private configService;
    private prisma;
    private readonly logger;
    private readonly openai;
    private readonly MIN_HELPFULNESS;
    private readonly MIN_ACCURACY;
    private readonly MIN_EMPATHY;
    private readonly MIN_CLARITY;
    private readonly MIN_OVERALL;
    private readonly ESCALATION_THRESHOLD;
    constructor(configService: ConfigService, prisma: PrismaService);
    validateResponse(response: string, context: {
        userMessage: string;
        customerId: string;
        intent?: string;
        emotionalTone?: string;
        history?: any[];
    }): Promise<ValidationResult>;
    private quickValidation;
    private scoreResponse;
    private improveResponse;
    private cleanImprovedResponse;
    private generateFailureReason;
    private logQualityCheck;
    getQualityStats(days?: number): Promise<{
        totalChecks: number;
        passed: number;
        failed: number;
        avgScore: number;
        avgHelpfulness: number;
        avgAccuracy: number;
        avgEmpathy: number;
        avgClarity: number;
    }>;
}
export {};
