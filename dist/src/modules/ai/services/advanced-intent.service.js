"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AdvancedIntentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedIntentService = void 0;
const common_1 = require("@nestjs/common");
const openai_1 = require("openai");
const config_1 = require("@nestjs/config");
let AdvancedIntentService = AdvancedIntentService_1 = class AdvancedIntentService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AdvancedIntentService_1.name);
        this.openai = new openai_1.default({
            apiKey: this.configService.get('OPENAI_API_KEY')
        });
    }
    async analyzeIntent(message, context) {
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
        }
        catch (error) {
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
    detectEmotionalTone(message) {
        const lower = message.toLowerCase();
        const frustratedKeywords = ['ridiculous', 'terrible', 'awful', 'useless', 'waste', 'annoying', 'frustrated', 'angry'];
        if (frustratedKeywords.some(kw => lower.includes(kw)))
            return 'frustrated';
        const excitedKeywords = ['excited', 'can\'t wait', 'amazing', 'love', 'perfect', 'wonderful'];
        const hasMultipleExclamations = (message.match(/!/g) || []).length >= 2;
        if (excitedKeywords.some(kw => lower.includes(kw)) || hasMultipleExclamations)
            return 'excited';
        const anxiousKeywords = ['worried', 'nervous', 'concerned', 'not sure', 'unsure', 'anxious', 'scared'];
        if (anxiousKeywords.some(kw => lower.includes(kw)))
            return 'anxious';
        const confusedKeywords = ['confused', 'don\'t understand', 'what do you mean', 'huh', 'unclear'];
        const hasMultipleQuestions = (message.match(/\?/g) || []).length >= 2;
        if (confusedKeywords.some(kw => lower.includes(kw)) || hasMultipleQuestions)
            return 'confused';
        const happyKeywords = ['thank', 'great', 'good', 'nice', 'happy', 'pleased'];
        if (happyKeywords.some(kw => lower.includes(kw)))
            return 'happy';
        return 'neutral';
    }
    requiresHumanHandoff(message, emotionalTone, conversationLength) {
        const lower = message.toLowerCase();
        if (/(talk|speak).*(human|person|agent|representative)/i.test(message))
            return true;
        if (emotionalTone === 'frustrated' && conversationLength > 3)
            return true;
        if (/(complaint|complain|report|manager|supervisor)/i.test(message))
            return true;
        if (conversationLength > 15)
            return true;
        return false;
    }
    extractMultipleIntents(message) {
        const intents = [];
        const lower = message.toLowerCase();
        if (/(book|schedule|reserve|appointment)/i.test(message))
            intents.push('booking');
        if (/(package|price|cost|how much|offer)/i.test(message))
            intents.push('package_inquiry');
        if (/(what|how|when|where|why|tell me|explain)/i.test(message) && !intents.includes('package_inquiry')) {
            intents.push('faq');
        }
        if (/(available|free|open|slot)/i.test(message))
            intents.push('availability');
        if (/(reschedule|change|move).*(date|time|appointment)/i.test(message))
            intents.push('reschedule');
        if (/(cancel|delete|remove)/i.test(message))
            intents.push('cancel');
        return intents.length > 0 ? intents : ['unknown'];
    }
    assessUrgency(message, context) {
        const lower = message.toLowerCase();
        const highUrgencyKeywords = ['urgent', 'asap', 'immediately', 'right now', 'emergency', 'today', 'tomorrow'];
        if (highUrgencyKeywords.some(kw => lower.includes(kw)))
            return 'high';
        if (/(today|tomorrow|this week)/i.test(message))
            return 'high';
        if (/(next week|this month|soon)/i.test(message))
            return 'medium';
        if (/(just wondering|curious|thinking about|maybe|might)/i.test(message))
            return 'low';
        return 'medium';
    }
    assessComplexity(message) {
        const questionCount = (message.match(/\?/g) || []).length;
        const sentenceCount = message.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        const conjunctionCount = (message.match(/\b(and|but|also|or|plus|additionally)\b/gi) || []).length;
        if (questionCount >= 3 || sentenceCount >= 5 || conjunctionCount >= 3)
            return 'complex';
        if (questionCount >= 2 || sentenceCount >= 3 || conjunctionCount >= 2)
            return 'moderate';
        return 'simple';
    }
};
exports.AdvancedIntentService = AdvancedIntentService;
exports.AdvancedIntentService = AdvancedIntentService = AdvancedIntentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AdvancedIntentService);
//# sourceMappingURL=advanced-intent.service.js.map