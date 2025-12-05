import { EscalationService } from './escalation.service';
export declare class EscalationController {
    private readonly escalationService;
    constructor(escalationService: EscalationService);
    getOpenEscalations(): Promise<({
        customer: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            phone: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        sentimentScore: number | null;
        customerId: string;
        status: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        reason: string | null;
        description: string | null;
        escalationType: string;
    })[]>;
    resolveEscalation(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        sentimentScore: number | null;
        customerId: string;
        status: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        reason: string | null;
        description: string | null;
        escalationType: string;
    }>;
}
