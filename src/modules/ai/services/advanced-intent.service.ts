// src/modules/ai/services/advanced-intent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
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

@Injectable()
export class AdvancedIntentService {
    private readonly logger = new Logger(AdvancedIntentService.name);
    private openai: OpenAI;

    constructor(private configService: ConfigService) {
        this.openai = new OpenAI({
            apiKey: this.configService.get<string>('OPENAI_API_KEY')
        });
    }

    /**
     * Analyze message for multiple intents and emotional context
     */
    async analyzeIntent(message: string, context?: any): Promise<IntentAnalysis> {
        const systemPrompt = `You are an expert intent classifier for a maternity photoshoot booking system.
Analyze the user's message and return a JSON object with:
- primaryIntent: main intent (booking, package_inquiry, faq, reschedule, cancel, complaint, price_inquiry, availability, objection)
- secondaryIntents: array of additional intents detected
- confidence: 0-1 score for primary intent
- emotionalTone: excited, anxious, frustrated, neutral, confused, happy
- urgencyLevel: low, medium, high
- complexity: simple (single request), moderate (2-3 requests), complex (multiple requests or unclear)
- requiresHumanHandoff: boolean (true if frustrated, very complex, or complaint)

Examples:
"I want to book the Gold package for next Friday at 2pm" 
→ {primaryIntent: "booking", secondaryIntents: [], confidence: 0.95, emotionalTone: "neutral", urgencyLevel: "medium", complexity: "simple", requiresHumanHandoff: false}

"Can you tell me about your packages and also what's included in the makeup? I'm not sure which one to choose"
→ {primaryIntent: "package_inquiry", secondaryIntents: ["faq"], confidence: 0.85, emotionalTone: "confused", urgencyLevel: "low", complexity: "moderate", requiresHumanHandoff: false}

"This is ridiculous! I've been trying to book for 10 minutes and nothing works!"
→ {primaryIntent: "complaint", secondaryIntents: ["booking"], confidence: 0.9, emotionalTone: "frustrated", urgencyLevel: "high", complexity: "simple", requiresHumanHandoff: true}`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3,
            });

            const analysis = JSON.parse(response.choices[0].message.content || '{}');

            this.logger.debug(`Intent analysis for "${message}": ${analysis.primaryIntent} (${analysis.confidence})`);

            return {
                primaryIntent: analysis.primaryIntent || 'unknown',
                secondaryIntents: analysis.secondaryIntents || [],
                confidence: analysis.confidence || 0.5,
                emotionalTone: analysis.emotionalTone || 'neutral',
                urgencyLevel: analysis.urgencyLevel || 'medium',
                complexity: analysis.complexity || 'simple',
                requiresHumanHandoff: analysis.requiresHumanHandoff || false,
            };
        } catch (error) {
            this.logger.error('Intent analysis failed', error);
            return {
                primaryIntent: 'unknown',
                secondaryIntents: [],
                confidence: 0.3,
                emotionalTone: 'neutral',
                urgencyLevel: 'medium',
                complexity: 'simple',
                requiresHumanHandoff: false,
            };
        }
    }

    /**
     * Detect emotional tone from message
     */
    detectEmotionalTone(message: string): 'excited' | 'anxious' | 'frustrated' | 'neutral' | 'confused' | 'happy' {
        const lower = message.toLowerCase();

        // Frustrated indicators
        const frustratedKeywords = ['ridiculous', 'terrible', 'awful', 'useless', 'waste', 'annoying', 'frustrated', 'angry'];
        if (frustratedKeywords.some(kw => lower.includes(kw))) return 'frustrated';

        // Excited indicators
        const excitedKeywords = ['excited', 'can\'t wait', 'amazing', 'love', 'perfect', 'wonderful'];
        const hasMultipleExclamations = (message.match(/!/g) || []).length >= 2;
        if (excitedKeywords.some(kw => lower.includes(kw)) || hasMultipleExclamations) return 'excited';

        // Anxious indicators
        const anxiousKeywords = ['worried', 'nervous', 'concerned', 'not sure', 'unsure', 'anxious', 'scared'];
        if (anxiousKeywords.some(kw => lower.includes(kw))) return 'anxious';

        // Confused indicators
        const confusedKeywords = ['confused', 'don\'t understand', 'what do you mean', 'huh', 'unclear'];
        const hasMultipleQuestions = (message.match(/\?/g) || []).length >= 2;
        if (confusedKeywords.some(kw => lower.includes(kw)) || hasMultipleQuestions) return 'confused';

        // Happy indicators
        const happyKeywords = ['thank', 'great', 'good', 'nice', 'happy', 'pleased'];
        if (happyKeywords.some(kw => lower.includes(kw))) return 'happy';

        return 'neutral';
    }

    /**
     * Determine if message requires human handoff
     */
    requiresHumanHandoff(message: string, emotionalTone: string, conversationLength: number): boolean {
        const lower = message.toLowerCase();

        // Explicit requests for human
        if (/(talk|speak).*(human|person|agent|representative)/i.test(message)) return true;

        // Strong frustration
        if (emotionalTone === 'frustrated' && conversationLength > 3) return true;

        // Complaints
        if (/(complaint|complain|report|manager|supervisor)/i.test(message)) return true;

        // Very long conversations (stuck)
        if (conversationLength > 15) return true;

        return false;
    }

    /**
     * Extract all intents from a complex message
     */
    extractMultipleIntents(message: string): string[] {
        const intents: string[] = [];
        const lower = message.toLowerCase();

        // Booking intent
        if (/(book|schedule|reserve|appointment)/i.test(message)) intents.push('booking');

        // Package inquiry
        if (/(package|price|cost|how much|offer)/i.test(message)) intents.push('package_inquiry');

        // FAQ
        if (/(what|how|when|where|why|tell me|explain)/i.test(message) && !intents.includes('package_inquiry')) {
            intents.push('faq');
        }

        // Availability
        if (/(available|free|open|slot)/i.test(message)) intents.push('availability');

        // Reschedule
        if (/(reschedule|change|move).*(date|time|appointment)/i.test(message)) intents.push('reschedule');

        // Cancel
        if (/(cancel|delete|remove)/i.test(message)) intents.push('cancel');

        return intents.length > 0 ? intents : ['unknown'];
    }

    /**
     * Assess urgency level
     */
    assessUrgency(message: string, context?: any): 'low' | 'medium' | 'high' {
        const lower = message.toLowerCase();

        // High urgency indicators
        const highUrgencyKeywords = ['urgent', 'asap', 'immediately', 'right now', 'emergency', 'today', 'tomorrow'];
        if (highUrgencyKeywords.some(kw => lower.includes(kw))) return 'high';

        // Check for near-term dates
        if (/(today|tomorrow|this week)/i.test(message)) return 'high';

        // Medium urgency - specific timeframes
        if (/(next week|this month|soon)/i.test(message)) return 'medium';

        // Low urgency - general inquiries
        if (/(just wondering|curious|thinking about|maybe|might)/i.test(message)) return 'low';

        return 'medium'; // Default
    }

    /**
     * Determine conversation complexity
     */
    assessComplexity(message: string): 'simple' | 'moderate' | 'complex' {
        // Count questions
        const questionCount = (message.match(/\?/g) || []).length;

        // Count sentences
        const sentenceCount = message.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

        // Count conjunctions (and, but, also, or)
        const conjunctionCount = (message.match(/\b(and|but|also|or|plus|additionally)\b/gi) || []).length;

        if (questionCount >= 3 || sentenceCount >= 5 || conjunctionCount >= 3) return 'complex';
        if (questionCount >= 2 || sentenceCount >= 3 || conjunctionCount >= 2) return 'moderate';
        return 'simple';
    }
}
