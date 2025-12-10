import { EscalationService } from './escalation.service';
export declare class EscalationController {
    private readonly escalationService;
    constructor(escalationService: EscalationService);
    getOpenEscalations(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
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
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        customerId: string;
        status: string;
        updatedAt: Date;
        sentimentScore: number | null;
        description: string | null;
        reason: string | null;
        escalationType: string;
    })[]>;
    resolveEscalation(id: string): Promise<{
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        customerId: string;
        status: string;
        updatedAt: Date;
        sentimentScore: number | null;
        description: string | null;
        reason: string | null;
        escalationType: string;
    }>;
}
