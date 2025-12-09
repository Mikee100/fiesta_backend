import { ResponseStrategy } from './response-strategy.interface';

export class PackageInquiryStrategy implements ResponseStrategy {
    readonly priority = 50; // Run after FAQ but before Booking

    canHandle(intent: string, context: any): boolean {
        const { message, hasDraft } = context;
        // Exclude backdrop/image requests which should go to FAQ flow
        const isBackdropImageRequest = /(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message);
        const isPackageQuery = !isBackdropImageRequest && /(package|price|pricing|cost|how much|offer|photoshoot|shoot|what do you have|what are|show me|tell me about|how about|what about|deposit)/i.test(message);

        // Allow package inquiries even if there's a draft - user might be comparing packages
        // Only block if the message is clearly a booking continuation (date/time related)
        const isBookingContinuation = hasDraft && /(date|time|when|schedule|book|appointment|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|\d{1,2}[:\-]\d{2})/i.test(message) && !/(deposit|payment|pay)/i.test(message);
        
        return isPackageQuery && !isBookingContinuation;
    }

    async generateResponse(message: string, context: any): Promise<any> {
        const { aiService, logger, history, historyLimit, customerId, prisma, hasDraft } = context;

        logger.log(`[STRATEGY] Executing PackageInquiryStrategy for: "${message}"`);

        try {
            // Check if there's an existing draft
            let existingDraft = hasDraft ? await prisma.bookingDraft.findUnique({ where: { customerId } }) : null;
            
            // Use public method from AiService (need to ensure it's public)
            const allPackages = await aiService.getCachedPackages();
            logger.log(`[PACKAGE QUERY] Found ${allPackages?.length || 0} packages in DB`);

            // Helper function to match package names with variations
            const matchPackage = (msg: string, packageName: string): boolean => {
                const lowerMsg = msg.toLowerCase();
                const lowerPkg = packageName.toLowerCase();

                // Exact match or contains
                if (lowerMsg.includes(lowerPkg)) return true;

                // Handle common variations
                const variations: { [key: string]: string[] } = {
                    'standard package': ['standard one', 'standard', 'basic package', 'basic one'],
                    'executive package': ['executive one', 'executive'],
                    'gold package': ['gold one', 'gold'],
                    'platinum package': ['platinum one', 'platinum'],
                    'vip package': ['vip one', 'vip'],
                    'vvip package': ['vvip one', 'vvip', 'v vip', 'v-vip'],
                };

                // Check if any variation matches
                for (const [canonical, vars] of Object.entries(variations)) {
                    if (lowerPkg === canonical) {
                        if (vars.some(v => lowerMsg.includes(v))) return true;
                    }
                }

                // Check reverse: if message contains a variation, match to canonical
                for (const [canonical, vars] of Object.entries(variations)) {
                    if (vars.some(v => lowerMsg.includes(v))) {
                        if (lowerPkg === canonical) return true;
                    }
                }

                return false;
            };

            if (allPackages && allPackages.length > 0) {
                let packages = allPackages;
                let packageType = '';
                if (/(outdoor)/i.test(message)) {
                    packages = allPackages.filter((p: any) => p.type?.toLowerCase() === 'outdoor');
                    packageType = 'outdoor ';
                } else if (/(studio|indoor)/i.test(message)) {
                    packages = allPackages.filter((p: any) => p.type?.toLowerCase() === 'studio');
                    packageType = 'studio ';
                }

                // If filtering resulted in no packages, but user specifically asked for a type, show appropriate message
                if (packages.length === 0 && (/(studio|indoor|outdoor)/i.test(message))) {
                    const requestedType = /(outdoor)/i.test(message) ? 'outdoor' : 'studio';
                    const response = `I'm so sorry, but we don't currently have any ${requestedType} packages available. However, we do have beautiful ${requestedType === 'outdoor' ? 'studio' : 'outdoor'} packages that might interest you! Would you like to see those instead? 💖`;
                    return { response, draft: existingDraft || null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                }

                if (packages.length > 0) {
                    // Check if asking about deposits specifically
                    const isDepositQuery = /(deposit|down payment|initial payment|advance payment)/i.test(message);
                    
                    if (isDepositQuery) {
                        // Check if asking about specific packages mentioned in message (e.g., "deposit for the two")
                        const mentionedPackages = packages.filter((p: any) => matchPackage(message, p.name));
                        
                        // Also check for phrases like "the two", "both", "these", etc. when packages were mentioned in recent history
                        const recentPackages = history.slice(-3).filter((h: any) => h.role === 'assistant').map((h: any) => {
                            const matches: any[] = [];
                            packages.forEach((p: any) => {
                                if (h.content && matchPackage(h.content, p.name)) {
                                    matches.push(p);
                                }
                            });
                            return matches;
                        }).flat();
                        
                        const uniqueRecentPackages = recentPackages.filter((p: any, index: number, self: any[]) => 
                            index === self.findIndex((t: any) => t.name === p.name)
                        );
                        
                        // If user said "the two" or similar, use recent packages (limit to 2)
                        const isAskingAboutRecent = /(the (two|both)|these|those|them)/i.test(message);
                        const packagesToShow = isAskingAboutRecent && uniqueRecentPackages.length > 0 
                            ? uniqueRecentPackages.slice(0, 2)
                            : mentionedPackages.length > 0 
                                ? mentionedPackages 
                                : packages;
                        
                        const depositInfo = packagesToShow.map((p: any) => 
                            `📦 *${p.name}*: KES ${p.deposit || 2000} deposit`
                        ).join('\n');
                        const response = `Here are the deposit amounts:\n\n${depositInfo}\n\nThe remaining balance is due after your photoshoot. 💖`;
                        return { response, draft: existingDraft || null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                    }
                    
                    // Check if asking for details about ALL packages ("tell me about each", "tell me about all of them")
                    const isAskingAboutAll = /(tell me about (each|all|every)|what (are|is) (each|all|every)|details (about|on) (each|all|every)|describe (each|all|every))/i.test(message);
                    
                    if (isAskingAboutAll) {
                        // Show detailed info for all packages
                        const packagesList = packages.map((p: any) => aiService.formatPackageDetails(p, true)).join('\n\n');
                        const response = `Oh, my dear, I'm so delighted to share details about all our ${packageType}packages with you! Each one is thoughtfully crafted to beautifully capture this precious time in your life. Here they are:\n\n${packagesList}\n\nWhich package would you like to book? 💖`;
                        return { response, draft: null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                    }

                    // Check if asking about a SPECIFIC package with detail keywords
                    // Include conversational patterns like "how about", "what about" as detail inquiries
                    const isAskingForDetails = /(tell me about|what is|what's|details|include|come with|feature|what does.*include|how about|what about)/i.test(message);
                    const specificPackage = packages.find((p: any) => matchPackage(message, p.name));

                    if (specificPackage && isAskingForDetails) {
                        // User wants DETAILS about a specific package - show details
                        // If there's an existing draft, preserve it; otherwise return null
                        const detailedInfo = aiService.formatPackageDetails(specificPackage, true);
                        let response = `${detailedInfo}\n\n`;
                        
                        if (existingDraft && existingDraft.service !== specificPackage.name) {
                            // User is comparing packages - they have a draft for a different package
                            response += `I see you were interested in the ${existingDraft.service}. Would you like to switch to the ${specificPackage.name} instead, or would you like to continue with ${existingDraft.service}? 💖`;
                        } else {
                            response += `This package is perfect for capturing beautiful moments! Would you like to book this package? 💖`;
                        }
                        
                        return { 
                            response, 
                            draft: existingDraft || null, // Preserve existing draft if it exists
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] 
                        };
                    }

                    if (specificPackage && !isAskingForDetails) {
                        // User mentioned a package but without detail keywords - they might want to book it
                        // Set the selected package in the booking draft and move to next step
                        let draft = await prisma.bookingDraft.findUnique({ where: { customerId } });
                        if (!draft) {
                            draft = await aiService.getOrCreateDraft(customerId);
                        }

                        draft = await prisma.bookingDraft.update({
                            where: { customerId },
                            data: { service: specificPackage.name },
                        });

                        const detailedInfo = aiService.formatPackageDetails(specificPackage, true);
                        const response = `${detailedInfo}\n\nI've noted you're interested in the ${specificPackage.name}. When would you like to come in for the shoot? (e.g., "next Tuesday at 10am") 🗓️`;

                        return {
                            response,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                        };
                    }

                    // List all packages (summary view)
                    const packagesList = packages.map((p: any) => aiService.formatPackageDetails(p, false)).join('\n\n');
                    const response = `Oh, my dear, I'm so delighted to share our ${packageType}packages with you! Each one is thoughtfully crafted to beautifully capture this precious time in your life. Here they are:\n\n${packagesList}\n\nIf you'd like to know more about any specific package, just ask! 💖`;

                    return { response, draft: null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                }
            }

            return null; // Should not happen if packages exist, but fallback to FAQ if null
        } catch (err) {
            logger.error('Error in PackageInquiryStrategy', err);
            throw err;
        }
    }
}
