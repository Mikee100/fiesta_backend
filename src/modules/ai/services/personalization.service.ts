// src/modules/ai/services/personalization.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CustomerMemoryService } from './customer-memory.service';

interface PersonalizationContext {
    relationshipStage: string;
    communicationStyle: string;
    isVIP: boolean;
    isReturning: boolean;
    preferredPackages?: string[];
    keyInsights?: string[];
}

@Injectable()
export class PersonalizationService {
    private readonly logger = new Logger(PersonalizationService.name);

    constructor(private customerMemory: CustomerMemoryService) { }

    /**
     * Adapt response based on customer's communication style
     */
    adaptResponse(baseResponse: string, style: 'brief' | 'detailed' | 'friendly'): string {
        if (style === 'brief') {
            // For package listings, preserve the full list even in brief mode
            // Check if this is a package listing response (contains package markers)
            const hasPackageList = /📦|package|KES|Standard|Economy|Executive|Gold|Platinum|VIP/i.test(baseResponse);
            
            // For contact details, preserve the full information
            const hasContactDetails = /contact details|📍|📞|📧|🌐|🕐|phone|email|location|address|hours/i.test(baseResponse);
            
            // For slot suggestions/time listings, preserve the full list
            const hasSlotSuggestions = /(here are|available times?|other times?|suggestions?|slots? for|do any of these|which.*work|which.*prefer)/i.test(baseResponse) &&
                                      /(\d{1,2}:\d{2}|\d{1,2}[ap]m|morning|afternoon|evening|AM|PM)/i.test(baseResponse);
            
            // For booking-related responses with suggestions, preserve them
            const hasBookingSuggestions = /(slot.*taken|not available|unavailable).*(here are|available|other|suggestions)/i.test(baseResponse);
            
            if (hasPackageList || hasContactDetails || hasSlotSuggestions || hasBookingSuggestions) {
                // Don't truncate package listings, contact details, or slot suggestions - they need to be complete
                // Just remove excessive emojis but keep the content
                return baseResponse
                    .replace(/💕|💖|🌸|✨|🎈|💐|🌟|😊|💁‍♀️|👑/g, '')
                    .replace(/(💡|📅|📦|📍|📞|📧|🌐|🕐|😔)/g, '$1'); // Keep essential emojis
            }
            
            // For other brief responses, remove emojis and keep concise
            return baseResponse
                .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
                .replace(/💕|💖|🌸|✨|🎈|💐|🌟|😊|💁‍♀️|👑/g, '')
                .split('\n\n')[0]; // Take first paragraph only
        }

        if (style === 'detailed') {
            // Keep detailed, but moderate emojis
            return baseResponse;
        }

        // Friendly - keep all emojis and warmth
        return baseResponse;
    }

    /**
     * Generate personalized greeting
     */
    async generateGreeting(customerId: string, customerName?: string): Promise<string> {
        const context = await this.customerMemory.getPersonalizationContext(customerId);

        // VIP treatment
        if (context.isVIP) {
            return `Welcome back, ${customerName || 'gorgeous'}! 👑 It's always a pleasure to assist our VIP clients. How can I make your day special? 💖`;
        }

        // Returning customer
        if (context.isReturning) {
            return `Hi ${customerName || 'lovely'}! 🌸 So wonderful to see you again! How can I help you today? 💕`;
        }

        // New customer
        if (context.relationshipStage === 'new') {
            return `Hi there! 💕 Welcome to Fiesta House Attire! I'm so excited to help you plan your maternity photoshoot. What can I help you with today? 🌸`;
        }

        // Interested (browsed before but didn't book)
        if (context.relationshipStage === 'interested') {
            return `Welcome back! 😊 I see you were looking at our packages before. Have you had a chance to think about which one might be perfect for you? I'm here to help! 💖`;
        }

        // Default
        return `Hi! 💕 How can I help you today? 🌸`;
    }

    /**
     * Add proactive suggestions based on context
     */
    async generateProactiveSuggestions(customerId: string, currentIntent: string): Promise<string[]> {
        const context = await this.customerMemory.getPersonalizationContext(customerId);
        const suggestions: string[] = [];

        // Package inquiry → suggest booking
        if (currentIntent === 'package_inquiry' && !context.isReturning) {
            suggestions.push("Once you've chosen a package, I can help you book your preferred date right away! 📅");
        }

        // Returning customer → upsell
        if (context.isReturning && currentIntent === 'booking') {
            suggestions.push("As a returning client, you might love our new seasonal backdrops! Want to see them? 🎨");
        }

        // VIP → premium options
        if (context.isVIP) {
            suggestions.push("We have exclusive time slots available for our VIP clients. Interested? ✨");
        }

        // Budget-conscious → payment plans
        if (context.budgetRange && context.budgetRange.max < 15000) {
            suggestions.push("We offer flexible payment plans if that helps! Just let me know. 💕");
        }

        // Booked before → remind about timing
        if (context.relationshipStage === 'booked' && currentIntent === 'faq') {
            suggestions.push("Don't forget - the best time for maternity shoots is 28-34 weeks! 🤰");
        }

        return suggestions;
    }

    /**
     * Personalize package recommendations
     */
    personalizePackagePresentation(packages: any[], context: PersonalizationContext): string {
        let intro = '';

        if (context.isReturning) {
            intro = `Welcome back! Based on your previous booking, I think you'll love these options:\n\n`;
        } else if (context.preferredPackages && context.preferredPackages.length > 0) {
            intro = `Based on what you've been looking at, here are my top recommendations:\n\n`;
        } else {
            intro = `Here are our beautiful packages, each designed to capture your special moments:\n\n`;
        }

        return intro;
    }

    /**
     * Adjust emotional tone of response
     */
    matchEmotionalTone(response: string, customerTone: string): string {
        switch (customerTone) {
            case 'excited':
                // Add more enthusiasm
                return response.replace(/\./g, '!').replace(/💕/g, '💕✨');

            case 'anxious':
                // Add reassurance
                return `${response}\n\nDon't worry, I'm here to help make this as easy and stress-free as possible! 💕`;

            case 'frustrated':
                // Add empathy and solutions
                return `I'm so sorry for any confusion! Let me help make this right. ${response}`;

            case 'confused':
                // Simplify and clarify
                return `Let me break this down simply:\n\n${response}\n\nDoes that make sense? Feel free to ask if anything is unclear! 😊`;

            default:
                return response;
        }
    }

    /**
     * Generate contextual follow-up questions
     */
    generateFollowUpQuestions(intent: string, context: PersonalizationContext): string[] {
        const questions: string[] = [];

        if (intent === 'package_inquiry') {
            if (!context.preferredPackages || context.preferredPackages.length === 0) {
                questions.push("What's most important to you - makeup, multiple outfits, or outdoor location?");
                questions.push("Do you have a budget range in mind?");
            }
        }

        if (intent === 'booking') {
            questions.push("Do you have a preferred date and time in mind?");
            if (!context.preferredPackages) {
                questions.push("Which package would you like to book?");
            }
        }

        return questions;
    }

    /**
     * Create personalized call-to-action
     */
    generateCTA(intent: string, context: PersonalizationContext): string {
        if (intent === 'package_inquiry') {
            if (context.isReturning) {
                return "Ready to book your next session with us? I can get you scheduled right away! 💖";
            }
            return "Would you like to book one of these packages? I can check availability for you! 📅";
        }

        if (intent === 'faq') {
            return "Any other questions? I'm here to help! Or ready to book? 🌸";
        }

        if (intent === 'booking') {
            return "Let's get you booked! What date works best for you? 📅";
        }

        return "What else can I help you with today? 💕";
    }

    /**
     * Detect and remember preferences from conversation
     */
    extractPreferencesFromMessage(message: string): {
        preferredPackages?: string[];
        budgetRange?: { min?: number; max?: number };
        preferredTimes?: string[];
        wantsMakeup?: boolean;
        wantsOutdoor?: boolean;
    } {
        const lower = message.toLowerCase();
        const preferences: any = {};

        // Budget detection
        const budgetMatch = message.match(/(\d+)\s*(?:ksh|shillings?|bob)/i);
        if (budgetMatch) {
            const amount = parseInt(budgetMatch[1]);
            preferences.budgetRange = { max: amount };
        }

        // Time preferences
        if (lower.includes('morning')) preferences.preferredTimes = ['morning'];
        if (lower.includes('afternoon')) preferences.preferredTimes = ['afternoon'];
        if (lower.includes('evening')) preferences.preferredTimes = ['evening'];

        // Feature preferences
        if (lower.includes('makeup')) preferences.wantsMakeup = true;
        if (lower.includes('outdoor') || lower.includes('beach')) preferences.wantsOutdoor = true;

        return preferences;
    }
}
