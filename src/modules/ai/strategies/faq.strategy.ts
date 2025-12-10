import { ResponseStrategy } from './response-strategy.interface';

/**
 * FAQ Strategy - Handles all FAQ, policy, and informational questions
 * This strategy runs FIRST (highest priority) to ensure FAQ questions
 * are answered even when there's an active booking draft
 */
export class FaqStrategy implements ResponseStrategy {
    /**
     * Priority: Higher number = runs first
     * FAQ strategy should run before booking/package strategies
     */
    readonly priority = 100;

    /**
     * Detects if this is an FAQ/policy question
     * Returns true for questions that should be answered directly,
     * regardless of whether there's an active booking draft
     */
    canHandle(intent: string, context: any): boolean {
        const { message } = context;
        
        // EXCLUDE package/service-related queries - let Package Inquiry Strategy handle them
        const isPackageQuery = /(package|packages|service|services|charges|charge|price|pricing|cost|how much|offer|photoshoot|shoot|what (packages|services) do you (have|offer)|what do you (have|offer)|what are.*(package|service)|show me.*(package|service)|tell me about.*(package|service)|deposit)/i.test(message);
        if (isPackageQuery) {
            return false; // Let Package Inquiry Strategy handle it
        }
        
        // EXCLUDE booking initiation requests - let Booking Strategy handle them
        // User wants to START a booking, not ask about the booking process
        const wantsToStartBooking = /(how.*(do|can).*(make|book|start|get|schedule).*(booking|appointment)|(i want|i'd like|i need|can i|please).*(to book|booking|appointment|make.*booking|schedule)|let.*book|start.*booking)/i.test(message);
        if (wantsToStartBooking) {
            return false; // Let Booking Strategy handle it - user wants to start booking
        }
        
        // EXCLUDE comprehensive contact details queries - let hardcoded handler provide complete response
        const isContactDetailsQuery = /(contact details|contact information|all contact|complete contact)/i.test(message);
        if (isContactDetailsQuery) {
            return false; // Let hardcoded handler in processConversationLogic handle it
        }
        
        // FAQ question patterns - comprehensive list
        const faqPatterns = [
            // Policy/permission questions
            /can i (bring|have|include|add|wear|do)/i,
            /is it (okay|ok|allowed|fine|permitted)/i,
            /are.*allowed/i,
            /what (can|should|may) i (bring|wear|do|expect)/i,
            
            // Family/partner questions
            /can.*(family|partner|husband|spouse|children|kids|baby|guests)/i,
            /bring.*(family|partner|husband|spouse|children|kids|guests)/i,
            /include.*(family|partner|husband|spouse|children|kids|baby)/i,
            
            // Information questions
            /what (is|are|do|does|should|can|will|was|were)/i,
            /how (long|much|many|do|does|can|will|should)/i,
            /when (do|does|can|will|should|is|are)/i,
            /where (do|does|can|will|is|are)/i,
            /why (do|does|can|will|should|is|are)/i,
            /tell me (about|more|how)/i,
            /explain/i,
            /describe/i,
            
            // Backdrop/image requests
            /(backdrop|background|studio set|flower wall|portfolio)/i,
            /show.*(image|photo|picture|portfolio|example)/i,
            /see.*(image|photo|picture|example)/i,
            
            // Business info questions
            /(hours|location|address|phone|contact|email|website)/i,
            /when (are|is).*(open|closed|available)/i,
            
            // General question indicators
            /\?/,
        ];

        // Check if message matches any FAQ pattern
        const isFaqQuestion = faqPatterns.some(pattern => pattern.test(message));
        
        // Exclude booking-specific continuations (date/time when there's a draft)
        const isBookingContinuation = context.hasDraft && 
            /(date|time|when|schedule|book|appointment|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|\d{1,2}[:\-]\d{2})/i.test(message) &&
            !isFaqQuestion; // If it's clearly an FAQ pattern, treat as FAQ
        
        return isFaqQuestion && !isBookingContinuation;
    }

    async generateResponse(message: string, context: any): Promise<any> {
        const { aiService, logger, history, historyLimit, customerId, enrichedContext, hasDraft, draft } = context;

        logger.log(`[FAQ STRATEGY] Handling FAQ question: "${message}"`);

        try {
            // Check for mentions of bringing external people or items that require admin attention
            await this.checkForExternalPeopleOrItems(message, customerId, enrichedContext, aiService, context);

            // Answer the FAQ question
            const reply = await aiService.answerFaq(message, history, undefined, customerId, enrichedContext);
            const replyText = typeof reply === 'object' && 'text' in reply ? reply.text : reply;

            // Preserve existing draft if there is one (user might continue booking after FAQ)
            return {
                response: replyText,
                draft: draft || null,
                updatedHistory: [
                    ...history.slice(-historyLimit),
                    { role: 'user', content: message },
                    { role: 'assistant', content: replyText as string }
                ]
            };
        } catch (error) {
            logger.error('[FAQ STRATEGY] Error answering FAQ', error);
            throw error;
        }
    }

    /**
     * Check if customer mentioned bringing external people or items that require admin attention
     */
    private async checkForExternalPeopleOrItems(
        message: string,
        customerId: string,
        enrichedContext: any,
        aiService: any,
        context: any
    ): Promise<void> {
        const { logger, prisma } = context;
        const lowerMessage = message.toLowerCase();

        // Patterns for external people/services - improved to catch "come with" variations
        const externalPeoplePatterns = [
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(makeup|mua|makeup artist|make-up artist|make up artist)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(photographer|photography|photo|shoot|photographer)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(videographer|video|videography)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(stylist|styling|hair|hairstylist|hair stylist)/i,
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(assistant|helper|team|friend|family|partner|husband|spouse)/i,
        ];

        // Patterns for items that might conflict with business policies - improved patterns
        const externalItemsPatterns = [
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(camera|equipment|gear|lighting|lights|studio equipment|backdrop|background|props|set)/i,
        ];

        // Patterns for pets/animals
        const petPatterns = [
            /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/i,
            /(bringing|bring|coming).*(my|own|personal).*(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/i,
        ];

        // Check if message mentions external people, items, or pets
        const mentionsExternalPeople = externalPeoplePatterns.some(pattern => pattern.test(message));
        const mentionsExternalItems = externalItemsPatterns.some(pattern => pattern.test(message));
        const mentionsPets = petPatterns.some(pattern => pattern.test(message));

        if (mentionsExternalPeople || mentionsExternalItems || mentionsPets) {
            try {
                // Extract what they're bringing
                let itemsMentioned: string[] = [];
                
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

                // Get customer and booking info from enriched context
                const customer = enrichedContext?.customer;
                const upcomingBooking = enrichedContext?.customer?.recentBookings?.[0];
                
                const itemsList = [...new Set(itemsMentioned)].map(item => item.charAt(0).toUpperCase() + item.slice(1)).join(', ') || 'external people/items';

                // Determine note type - prioritize pets as external_items, then people, then items
                const noteType = mentionsPets ? 'external_items' : (mentionsExternalPeople ? 'external_people' : 'external_items');

                // Save session note to database
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
                } catch (error) {
                    logger.error('[FAQ STRATEGY] Failed to save session note', error);
                }

                // Create admin alert
                await aiService.createEscalationAlert(
                    customerId,
                    'ai_escalation',
                    'Customer Bringing External People/Items',
                    `Customer mentioned bringing ${itemsList} to their session. This may require coordination or policy review.`,
                    {
                        itemsMentioned: itemsMentioned,
                        itemsList: itemsList,
                        originalMessage: message,
                        bookingId: upcomingBooking?.id,
                        bookingService: upcomingBooking?.service,
                        bookingDateTime: upcomingBooking?.dateTime,
                        requiresAttention: true,
                    }
                );

                logger.log(`[FAQ STRATEGY] Created admin alert for external people/items: ${itemsList}`);
            } catch (error) {
                logger.error('[FAQ STRATEGY] Failed to create external people/items alert', error);
                // Don't throw - alert creation failure shouldn't break the flow
            }
        }
    }
}

