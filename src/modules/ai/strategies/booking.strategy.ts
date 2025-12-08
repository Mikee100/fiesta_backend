import { ResponseStrategy } from './response-strategy.interface';

export class BookingStrategy implements ResponseStrategy {
    canHandle(intent: string, context: any): boolean {
        const { hasDraft } = context;
        return hasDraft || intent === 'booking';
    }

    async generateResponse(message: string, context: any): Promise<any> {
        const { aiService, logger, history, historyLimit, customerId, bookingsService, hasDraft } = context;
        const { DateTime } = require('luxon');

        // logger.log(`[STRATEGY] Executing BookingStrategy for: "${message}"`);

        // Always start a fresh booking draft for every new booking intent
        // Remove any previous draft/payment state
        await bookingsService.deleteBookingDraft(customerId);
        let draft = await aiService.getOrCreateDraft(customerId);

        // Extract details
        const extraction = await aiService.extractBookingDetails(message, history);
        logger.debug(`[STRATEGY] Extraction result:`, extraction);

        // Merge into draft
        draft = await aiService.mergeIntoDraft(customerId, extraction);

        // Handle explicit confirmation of phone number
        if (extraction.subIntent === 'confirm' && !draft.recipientPhone && draft.recipientName) {
            // User said "yes" to "is this number correct?", so we fetch and set the phone
            const confirmed = await aiService.confirmCustomerPhone(customerId);
            if (confirmed) {
                // Refresh draft
                draft = await aiService.getOrCreateDraft(customerId);
            }
        }

        // STEP 1: Check for missing name
        if (!draft.name) {
            const response = "Now, could you kindly share your name with me? It's so important to have everything perfect for you. 😊";
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }



        // Check availability immediately if date and time are provided
        if (draft.date && draft.time && draft.service) {
            const normalized = aiService.normalizeDateTime(draft.date, draft.time);
            if (normalized) {
                const dateObj = new Date(normalized.isoUtc);
                const avail = await bookingsService.checkAvailability(dateObj, draft.service);
                logger.debug('Availability check result:', { available: avail.available, suggestions: avail.suggestions?.length || 0 });

                if (!avail.available) {
                    const suggestions = avail.suggestions.map((s: any) => `- ${DateTime.fromISO(s).toFormat('h:mm a, MMM d')}`).join('\n');
                    const response = `I'm so sorry, but that slot is already taken. 😔\nHere are some other times I have available:\n${suggestions}\n\nDo any of these work for you?`;
                    return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                }
            }
        }

        // Check if complete
        const completion = await aiService.checkAndCompleteIfConfirmed(draft, extraction, customerId, bookingsService);

        // Handle booking conflicts
        if (completion.action === 'conflict') {
            const conflictMessage = typeof completion.message === 'string' ? completion.message : 'That time slot is not available.';
            let response = `I'm sorry, but it looks like you already have a booking around that time. ${conflictMessage}`;
            if (completion.suggestions && completion.suggestions.length > 0) {
                const suggestedTimes = completion.suggestions
                    .map((s: string, i: number) => `${i + 1}. ${DateTime.fromISO(s).toFormat('h:mm a, MMM d')}`)
                    .join('\n');
                response += `\n\nHere are some available time slots:\n${suggestedTimes}\n\nWhich one would you prefer? (1-${completion.suggestions.length})`;
            } else {
                response += ' Would you like to try a different time?';
            }
            return {
                response,
                draft,
                updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
            };
        }

        if (completion.action === 'unavailable') {
            const suggestions = completion.suggestions.map((s: any) => `- ${s}`).join('\n');
            const response = `I'm so sorry, but that slot is already taken. 😔\nHere are some other times I have available:\n${suggestions}\n\nDo any of these work for you?`;
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }

        // Deposit confirmation step
        // If all details are present, but user hasn't confirmed deposit, prompt for confirmation
        if (completion.action === 'ready_for_deposit') {
            const response = `Great! Here are your booking details:\n\n• Package: ${completion.packageName || 'selected'}\n• Date: ${draft.date}\n• Time: ${draft.time}\n• Name: ${draft.name}\n• Phone: ${draft.recipientPhone}\n\nTo confirm your booking, a deposit of KSH ${completion.amount} is required.\n\nReply with *CONFIRM* to accept and receive the payment prompt. If you need to make changes, just let me know!`;
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }

        // If user replied CONFIRM, then initiate payment
        if (completion.action === 'payment_initiated') {
            const response = `Awesome, we're almost done! 🎉\n\nTo lock in your booking for the ${completion.packageName || 'selected'} package, a deposit of KSH ${completion.amount} is required—this helps us secure your spot and prepare everything just for you.\n\nI am now sending the payment prompt to your phone.`;
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }

        if (completion.action === 'failed') {
            const response = completion.error || "I'm having trouble processing that. Could you please double check the details? 🥺";
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }

        // If not complete, generate reply
        const response = await aiService.generateBookingReply(message, draft, extraction, history, bookingsService);
        return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
    }
}
