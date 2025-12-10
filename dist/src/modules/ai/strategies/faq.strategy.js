"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaqStrategy = void 0;
class FaqStrategy {
    constructor() {
        this.priority = 100;
    }
    canHandle(intent, context) {
        const { message } = context;
        const isPackageQuery = /(package|packages|service|services|charges|charge|price|pricing|cost|how much|offer|photoshoot|shoot|what (packages|services) do you (have|offer)|what do you (have|offer)|what are.*(package|service)|show me.*(package|service)|tell me about.*(package|service)|deposit)/i.test(message);
        if (isPackageQuery) {
            return false;
        }
        const wantsToStartBooking = /(how.*(do|can).*(make|book|start|get|schedule).*(booking|appointment)|(i want|i'd like|i need|can i|please).*(to book|booking|appointment|make.*booking|schedule)|let.*book|start.*booking)/i.test(message);
        if (wantsToStartBooking) {
            return false;
        }
        const isContactDetailsQuery = /(contact details|contact information|all contact|complete contact)/i.test(message);
        if (isContactDetailsQuery) {
            return false;
        }
        const faqPatterns = [
            /can i (bring|have|include|add|wear|do)/i,
            /is it (okay|ok|allowed|fine|permitted)/i,
            /are.*allowed/i,
            /what (can|should|may) i (bring|wear|do|expect)/i,
            /can.*(family|partner|husband|spouse|children|kids|baby|guests)/i,
            /bring.*(family|partner|husband|spouse|children|kids|guests)/i,
            /include.*(family|partner|husband|spouse|children|kids|baby)/i,
            /what (is|are|do|does|should|can|will|was|were)/i,
            /how (long|much|many|do|does|can|will|should)/i,
            /when (do|does|can|will|should|is|are)/i,
            /where (do|does|can|will|is|are)/i,
            /why (do|does|can|will|should|is|are)/i,
            /tell me (about|more|how)/i,
            /explain/i,
            /describe/i,
            /(backdrop|background|studio set|flower wall|portfolio)/i,
            /show.*(image|photo|picture|portfolio|example)/i,
            /see.*(image|photo|picture|example)/i,
            /(hours|location|address|phone|contact|email|website)/i,
            /when (are|is).*(open|closed|available)/i,
            /\?/,
        ];
        const isFaqQuestion = faqPatterns.some(pattern => pattern.test(message));
        const isBookingContinuation = context.hasDraft &&
            /(date|time|when|schedule|book|appointment|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|\d{1,2}[:\-]\d{2})/i.test(message) &&
            !isFaqQuestion;
        return isFaqQuestion && !isBookingContinuation;
    }
    async generateResponse(message, context) {
        const { aiService, logger, history, historyLimit, customerId, enrichedContext, hasDraft, draft } = context;
        logger.log(`[FAQ STRATEGY] Handling FAQ question: "${message}"`);
        try {
            await this.checkForExternalPeopleOrItems(message, customerId, enrichedContext, aiService, context);
            const reply = await aiService.answerFaq(message, history, undefined, customerId, enrichedContext);
            const replyText = typeof reply === 'object' && 'text' in reply ? reply.text : reply;
            return {
                response: replyText,
                draft: draft || null,
                updatedHistory: [
                    ...history.slice(-historyLimit),
                    { role: 'user', content: message },
                    { role: 'assistant', content: replyText }
                ]
            };
        }
        catch (error) {
            logger.error('[FAQ STRATEGY] Error answering FAQ', error);
            throw error;
        }
    }
    async checkForExternalPeopleOrItems(message, customerId, enrichedContext, aiService, context) {
        const { logger, prisma } = context;
        const lowerMessage = message.toLowerCase();
        const externalPeoplePatterns = [
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(makeup|mua|makeup artist|make-up artist|make up artist)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(photographer|photography|photo|shoot|photographer)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(videographer|video|videography)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(stylist|styling|hair|hairstylist|hair stylist)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(assistant|helper|team|friend|family|partner|husband|spouse)/i,
        ];
        const externalItemsPatterns = [
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(camera|equipment|gear|lighting|lights|studio equipment|backdrop|background|props|set)/i,
        ];
        const petPatterns = [
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/i,
            /(bringing|bring|coming).*(my|own|personal).*(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/i,
        ];
        const mentionsExternalPeople = externalPeoplePatterns.some(pattern => pattern.test(message));
        const mentionsExternalItems = externalItemsPatterns.some(pattern => pattern.test(message));
        const mentionsPets = petPatterns.some(pattern => pattern.test(message));
        if (mentionsExternalPeople || mentionsExternalItems || mentionsPets) {
            try {
                let itemsMentioned = [];
                if (mentionsExternalPeople) {
                    const peopleMatches = [
                        ...message.matchAll(/(?:bring|coming|coming with|have).*?(?:my|own|personal).*?(makeup|mua|makeup artist|make-up artist|photographer|photography|photographer|photo|shoot|videographer|video|videography|stylist|styling|hair|hairstylist|assistant|helper|team)/gi)
                    ];
                    itemsMentioned.push(...peopleMatches.map(m => m[1]));
                }
                if (mentionsExternalItems) {
                    const itemsMatches = [
                        ...message.matchAll(/(?:bring|bringing|bringing my|bringing own).*?(camera|equipment|gear|lighting|lights|studio equipment|backdrop|background|props|set)/gi)
                    ];
                    itemsMentioned.push(...itemsMatches.map(m => m[1]));
                }
                if (mentionsPets) {
                    const petMatches = [
                        ...message.matchAll(/(?:bring|bringing|coming|have).*?(?:my|own|personal).*?(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/gi)
                    ];
                    itemsMentioned.push(...petMatches.map(m => m[1]));
                }
                const customer = enrichedContext?.customer;
                const upcomingBooking = enrichedContext?.customer?.recentBookings?.[0];
                const itemsList = [...new Set(itemsMentioned)].map(item => item.charAt(0).toUpperCase() + item.slice(1)).join(', ') || 'external people/items';
                const noteType = mentionsPets ? 'external_items' : (mentionsExternalPeople ? 'external_people' : 'external_items');
                try {
                    const { prisma } = context;
                    if (prisma) {
                        await prisma.customerSessionNote.create({
                            data: {
                                customerId,
                                type: noteType,
                                items: itemsMentioned,
                                description: `Customer mentioned bringing: ${itemsList}`,
                                bookingId: upcomingBooking?.id,
                                sourceMessage: message,
                                platform: enrichedContext?.customer?.platform || 'unknown',
                                status: 'pending',
                            },
                        });
                        logger.log(`[FAQ STRATEGY] Saved session note for customer ${customerId}: ${itemsList}`);
                    }
                }
                catch (error) {
                    logger.error('[FAQ STRATEGY] Failed to save session note', error);
                }
                await aiService.createEscalationAlert(customerId, 'ai_escalation', 'Customer Bringing External People/Items', `Customer mentioned bringing ${itemsList} to their session. This may require coordination or policy review.`, {
                    itemsMentioned: itemsMentioned,
                    itemsList: itemsList,
                    originalMessage: message,
                    bookingId: upcomingBooking?.id,
                    bookingService: upcomingBooking?.service,
                    bookingDateTime: upcomingBooking?.dateTime,
                    requiresAttention: true,
                });
                logger.log(`[FAQ STRATEGY] Created admin alert for external people/items: ${itemsList}`);
            }
            catch (error) {
                logger.error('[FAQ STRATEGY] Failed to create external people/items alert', error);
            }
        }
    }
}
exports.FaqStrategy = FaqStrategy;
//# sourceMappingURL=faq.strategy.js.map