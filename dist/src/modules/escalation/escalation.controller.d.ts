import { EscalationService } from './escalation.service';
export declare class EscalationController {
    private readonly escalationService;
    constructor(escalationService: EscalationService);
    getOpenEscalations(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            email: string | null;
            phone: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
        };
    } & {
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        status: string;
        sentimentScore: number | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        reason: string | null;
        escalationType: string;
    })[]>;
    resolveEscalation(id: string): Promise<{
        id: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        status: string;
        sentimentScore: number | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        reason: string | null;
        escalationType: string;
    }>;
}
