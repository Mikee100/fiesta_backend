async;
handleConversationWithLearning(message, string, customerId, string, history, any[] = [], bookingsService ?  : any, retryCount = 0, enrichedContext ?  : any);
Promise < any > {
    const: conversationStartTime = Date.now(),
    let, personalizationContext: any = null,
    let, intentAnalysis: any = null,
    let, wasSuccessful = false,
    let, conversationOutcome = 'unknown',
    try: {
        : .customerMemory
    }
};
{
    try {
        personalizationContext = await this.customerMemory.getPersonalizationContext(customerId);
        this.logger.debug(`[LEARNING] Loaded context for ${customerId}: ${personalizationContext.relationshipStage}`);
        enrichedContext = {
            ...enrichedContext,
            personalization: personalizationContext,
        };
    }
    catch (err) {
        this.logger.warn('[LEARNING] Failed to load customer context', err);
    }
}
if (this.advancedIntent) {
    try {
        intentAnalysis = await this.advancedIntent.analyzeIntent(message, personalizationContext);
        this.logger.debug(`[LEARNING] Intent: ${intentAnalysis.primaryIntent} (confidence: ${intentAnalysis.confidence}), Tone: ${intentAnalysis.emotionalTone}`);
        if (intentAnalysis.requiresHumanHandoff && this.escalationService) {
            await this.escalationService.createEscalation(customerId, 'AI detected need for human assistance', 'auto_detected', { intentAnalysis, message });
        }
    }
    catch (err) {
        this.logger.warn('[LEARNING] Intent analysis failed', err);
    }
}
if (history.length === 0 && this.personalization && personalizationContext) {
    try {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        const greeting = await this.personalization.generateGreeting(customerId, customer?.name);
        history = [{ role: 'assistant', content: greeting }];
    }
    catch (err) {
        this.logger.warn('[LEARNING] Failed to generate greeting', err);
    }
}
const result = await this.handleConversation(message, customerId, history, bookingsService, retryCount, enrichedContext);
if (result.response && this.personalization && personalizationContext) {
    try {
        result.response = this.personalization.adaptResponse(result.response, personalizationContext.communicationStyle || 'friendly');
        if (intentAnalysis?.emotionalTone) {
            result.response = this.personalization.matchEmotionalTone(result.response, intentAnalysis.emotionalTone);
        }
        if (intentAnalysis?.primaryIntent) {
            const suggestions = await this.personalization.generateProactiveSuggestions(customerId, intentAnalysis.primaryIntent);
            if (suggestions.length > 0 && Math.random() > 0.7) {
                result.response += `\n\n💡 ${suggestions[0]}`;
            }
        }
    }
    catch (err) {
        this.logger.warn('[LEARNING] Personalization failed', err);
    }
}
wasSuccessful = !result.response?.includes('trouble') && !result.response?.includes('error');
if (result.draft && result.draft.step === 'confirm')
    conversationOutcome = 'booking_initiated';
else if (intentAnalysis?.primaryIntent === 'booking')
    conversationOutcome = 'booking_in_progress';
else if (intentAnalysis?.primaryIntent === 'package_inquiry')
    conversationOutcome = 'information_provided';
else
    conversationOutcome = 'resolved';
if (this.conversationLearning) {
    try {
        const timeToResolution = Math.floor((Date.now() - conversationStartTime) / 1000);
        await this.conversationLearning.recordLearning(customerId, {
            userMessage: message,
            aiResponse: result.response || '',
            extractedIntent: intentAnalysis?.primaryIntent || 'unknown',
            emotionalTone: intentAnalysis?.emotionalTone,
            wasSuccessful,
            conversationOutcome,
            conversationLength: history.length + 1,
            timeToResolution,
        });
    }
    catch (err) {
        this.logger.warn('[LEARNING] Failed to record learning', err);
    }
}
if (this.customerMemory && this.personalization) {
    try {
        const preferences = this.personalization.extractPreferencesFromMessage(message);
        if (Object.keys(preferences).length > 0) {
            await this.customerMemory.updatePreferences(customerId, preferences);
        }
        if (conversationOutcome === 'booking_initiated' && personalizationContext.relationshipStage === 'new') {
            await this.customerMemory.updateRelationshipStage(customerId, 'booked');
        }
        else if (conversationOutcome === 'information_provided' && personalizationContext.relationshipStage === 'new') {
            await this.customerMemory.updateRelationshipStage(customerId, 'interested');
        }
        await this.customerMemory.addConversationSummary(customerId, {
            date: new Date(),
            intent: intentAnalysis?.primaryIntent || 'unknown',
            outcome: conversationOutcome,
            keyPoints: [message.substring(0, 100)],
        });
        if (history.length >= 3) {
            const userMessages = history.filter((h) => h.role === 'user').map((h) => h.content);
            const detectedStyle = this.customerMemory.detectCommunicationStyle(userMessages);
            await this.customerMemory.updatePreferences(customerId, {
                communicationStyle: detectedStyle,
            });
        }
    }
    catch (err) {
        this.logger.warn('[LEARNING] Failed to update customer memory', err);
    }
}
return result;
try { }
catch (error) {
    if (this.conversationLearning) {
        try {
            await this.conversationLearning.recordLearning(customerId, {
                userMessage: message,
                aiResponse: error.message || 'Error occurred',
                extractedIntent: intentAnalysis?.primaryIntent || 'unknown',
                emotionalTone: intentAnalysis?.emotionalTone,
                wasSuccessful: false,
                conversationOutcome: 'error',
                conversationLength: history.length + 1,
            });
        }
        catch (err) {
            this.logger.warn('[LEARNING] Failed to record error learning', err);
        }
    }
    throw error;
}
formatPackageDetails(pkg, any, detailed, boolean = false);
string;
{
    return this.formatPackageDetails(pkg, detailed);
}
//# sourceMappingURL=learning-wrapper-method.js.map