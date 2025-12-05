import { ConfigService } from '@nestjs/config';
interface IntentAnalysis {
    primaryIntent: string;
    secondaryIntents: string[];
    confidence: number;
    emotionalTone: 'excited' | 'anxious' | 'frustrated' | 'neutral' | 'confused' | 'happy';
    urgencyLevel: 'low' | 'medium' | 'high';
    complexity: 'simple' | 'moderate' | 'complex';
    requiresHumanHandoff: boolean;
}
export declare class AdvancedIntentService {
    private configService;
    private readonly logger;
    private openai;
    constructor(configService: ConfigService);
    analyzeIntent(message: string, context?: any): Promise<IntentAnalysis>;
    detectEmotionalTone(message: string): 'excited' | 'anxious' | 'frustrated' | 'neutral' | 'confused' | 'happy';
    requiresHumanHandoff(message: string, emotionalTone: string, conversationLength: number): boolean;
    extractMultipleIntents(message: string): string[];
    assessUrgency(message: string, context?: any): 'low' | 'medium' | 'high';
    assessComplexity(message: string): 'simple' | 'moderate' | 'complex';
}
export {};
