import { CustomerMemoryService } from './customer-memory.service';
interface PersonalizationContext {
    relationshipStage: string;
    communicationStyle: string;
    isVIP: boolean;
    isReturning: boolean;
    preferredPackages?: string[];
    keyInsights?: string[];
}
export declare class PersonalizationService {
    private customerMemory;
    private readonly logger;
    constructor(customerMemory: CustomerMemoryService);
    adaptResponse(baseResponse: string, style: 'brief' | 'detailed' | 'friendly'): string;
    generateGreeting(customerId: string, customerName?: string): Promise<string>;
    generateProactiveSuggestions(customerId: string, currentIntent: string): Promise<string[]>;
    personalizePackagePresentation(packages: any[], context: PersonalizationContext): string;
    matchEmotionalTone(response: string, customerTone: string): string;
    generateFollowUpQuestions(intent: string, context: PersonalizationContext): string[];
    generateCTA(intent: string, context: PersonalizationContext): string;
    extractPreferencesFromMessage(message: string): {
        preferredPackages?: string[];
        budgetRange?: {
            min?: number;
            max?: number;
        };
        preferredTimes?: string[];
        wantsMakeup?: boolean;
        wantsOutdoor?: boolean;
    };
}
export {};
