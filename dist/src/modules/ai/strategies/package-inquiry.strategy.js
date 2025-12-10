"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageInquiryStrategy = void 0;
class PackageInquiryStrategy {
    constructor() {
        this.priority = 50;
    }
    canHandle(intent, context) {
        const { message, hasDraft } = context;
        const isBackdropImageRequest = /(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message);
        const isPackageQuery = !isBackdropImageRequest && /(package|packages|service|services|price|pricing|cost|how much|offer|photoshoot|shoot|what (packages|services) do you (have|offer)|what do you (have|offer)|what are|show me|tell me about|how about|what about|deposit)/i.test(message);
        const isBookingContinuation = hasDraft && /(date|time|when|schedule|book|appointment|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|\d{1,2}[:\-]\d{2})/i.test(message) && !/(deposit|payment|pay)/i.test(message);
        return isPackageQuery && !isBookingContinuation;
    }
    async generateResponse(message, context) {
        const { aiService, logger, history, historyLimit, customerId, prisma, hasDraft } = context;
        logger.log(`[STRATEGY] Executing PackageInquiryStrategy for: "${message}"`);
        try {
            let existingDraft = hasDraft ? await prisma.bookingDraft.findUnique({ where: { customerId } }) : null;
            const allPackages = await aiService.getCachedPackages();
            logger.log(`[PACKAGE QUERY] Found ${allPackages?.length || 0} packages in DB`);
            const matchPackage = (msg, packageName) => {
                const lowerMsg = msg.toLowerCase();
                const lowerPkg = packageName.toLowerCase();
                if (lowerMsg.includes(lowerPkg))
                    return true;
                const variations = {
                    'standard package': ['standard one', 'standard', 'basic package', 'basic one'],
                    'executive package': ['executive one', 'executive'],
                    'gold package': ['gold one', 'gold'],
                    'platinum package': ['platinum one', 'platinum'],
                    'vip package': ['vip one', 'vip'],
                    'vvip package': ['vvip one', 'vvip', 'v vip', 'v-vip'],
                };
                for (const [canonical, vars] of Object.entries(variations)) {
                    if (lowerPkg === canonical) {
                        if (vars.some(v => lowerMsg.includes(v)))
                            return true;
                    }
                }
                for (const [canonical, vars] of Object.entries(variations)) {
                    if (vars.some(v => lowerMsg.includes(v))) {
                        if (lowerPkg === canonical)
                            return true;
                    }
                }
                return false;
            };
            if (allPackages && allPackages.length > 0) {
                let packages = allPackages;
                let packageType = '';
                if (/(outdoor)/i.test(message)) {
                    packages = allPackages.filter((p) => p.type?.toLowerCase() === 'outdoor');
                    packageType = 'outdoor ';
                }
                else if (/(studio|indoor)/i.test(message)) {
                    packages = allPackages.filter((p) => p.type?.toLowerCase() === 'studio');
                    packageType = 'studio ';
                }
                if (packages.length === 0 && (/(studio|indoor|outdoor)/i.test(message))) {
                    const requestedType = /(outdoor)/i.test(message) ? 'outdoor' : 'studio';
                    const response = `I'm so sorry, but we don't currently have any ${requestedType} packages available. However, we do have beautiful ${requestedType === 'outdoor' ? 'studio' : 'outdoor'} packages that might interest you! Would you like to see those instead? 💖`;
                    return { response, draft: existingDraft || null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                }
                if (packages.length > 0) {
                    const isDepositQuery = /(deposit|down payment|initial payment|advance payment)/i.test(message);
                    if (isDepositQuery) {
                        const mentionedPackages = packages.filter((p) => matchPackage(message, p.name));
                        const recentPackages = history.slice(-3).filter((h) => h.role === 'assistant').map((h) => {
                            const matches = [];
                            packages.forEach((p) => {
                                if (h.content && matchPackage(h.content, p.name)) {
                                    matches.push(p);
                                }
                            });
                            return matches;
                        }).flat();
                        const uniqueRecentPackages = recentPackages.filter((p, index, self) => index === self.findIndex((t) => t.name === p.name));
                        const isAskingAboutRecent = /(the (two|both)|these|those|them)/i.test(message);
                        const packagesToShow = isAskingAboutRecent && uniqueRecentPackages.length > 0
                            ? uniqueRecentPackages.slice(0, 2)
                            : mentionedPackages.length > 0
                                ? mentionedPackages
                                : packages;
                        const depositInfo = packagesToShow.map((p) => `📦 *${p.name}*: KES ${p.deposit || 2000} deposit`).join('\n');
                        const response = `Here are the deposit amounts:\n\n${depositInfo}\n\nThe remaining balance is due after your photoshoot. 💖`;
                        return { response, draft: existingDraft || null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                    }
                    const isAskingAboutAll = /(tell me about (each|all|every)|what (are|is) (each|all|every)|details (about|on) (each|all|every)|describe (each|all|every))/i.test(message);
                    if (isAskingAboutAll) {
                        const packagesList = packages.map((p) => aiService.formatPackageDetails(p, true)).join('\n\n');
                        const response = `Oh, my dear, I'm so delighted to share details about all our ${packageType}packages with you! Each one is thoughtfully crafted to beautifully capture this precious time in your life. Here they are:\n\n${packagesList}\n\nWhich package would you like to book? 💖`;
                        return { response, draft: null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                    }
                    const wantsThatOne = /(i want (that|this) (one|package)|i'll take (that|this) (one|package)|i choose (that|this) (one|package)|i'll go with (that|this) (one|package)|(that|this) one|i want it|i'll take it)/i.test(message);
                    let specificPackage = packages.find((p) => matchPackage(message, p.name));
                    if (wantsThatOne && !specificPackage) {
                        const recentMessages = history.slice(-5).filter((h) => h.role === 'assistant');
                        for (const msg of recentMessages.reverse()) {
                            const mentionedPackage = packages.find((p) => {
                                return msg.content && matchPackage(msg.content, p.name);
                            });
                            if (mentionedPackage) {
                                specificPackage = mentionedPackage;
                                logger.log(`[PACKAGE QUERY] Found package "${specificPackage.name}" from conversation history`);
                                break;
                            }
                        }
                    }
                    const isAskingForDetails = /(tell me about|what is|what's|details|include|come with|feature|what does.*include|how about|what about)/i.test(message);
                    if (specificPackage && isAskingForDetails) {
                        const detailedInfo = aiService.formatPackageDetails(specificPackage, true);
                        let response = `${detailedInfo}\n\n`;
                        if (existingDraft && existingDraft.service !== specificPackage.name) {
                            response += `I see you were interested in the ${existingDraft.service}. Would you like to switch to the ${specificPackage.name} instead, or would you like to continue with ${existingDraft.service}? 💖`;
                        }
                        else {
                            response += `This package is perfect for capturing beautiful moments! Would you like to book this package? 💖`;
                        }
                        return {
                            response,
                            draft: existingDraft || null,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                        };
                    }
                    if (specificPackage && !isAskingForDetails) {
                        let draft = await prisma.bookingDraft.findUnique({ where: { customerId } });
                        if (!draft) {
                            draft = await aiService.getOrCreateDraft(customerId);
                        }
                        draft = await prisma.bookingDraft.update({
                            where: { customerId },
                            data: {
                                service: specificPackage.name,
                                step: 'date'
                            },
                        });
                        const response = `Perfect! I've noted you'd like the ${specificPackage.name}. When would you like to come in for the shoot? (e.g., "next Tuesday at 10am") 🗓️`;
                        return {
                            response,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                        };
                    }
                    const packagesList = packages.map((p) => aiService.formatPackageDetails(p, false)).join('\n\n');
                    const packageTypeLabel = packageType ? `${packageType}packages` : 'packages (both studio and outdoor)';
                    const response = `Oh, my dear, I'm so delighted to share our ${packageTypeLabel} with you! Each one is thoughtfully crafted to beautifully capture this precious time in your life. Here they are:\n\n${packagesList}\n\nIf you'd like to know more about any specific package, just ask! 💖`;
                    return { response, draft: null, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                }
            }
            return null;
        }
        catch (err) {
            logger.error('Error in PackageInquiryStrategy', err);
            throw err;
        }
    }
}
exports.PackageInquiryStrategy = PackageInquiryStrategy;
//# sourceMappingURL=package-inquiry.strategy.js.map