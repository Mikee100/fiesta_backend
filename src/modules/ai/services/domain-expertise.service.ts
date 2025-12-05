// src/modules/ai/services/domain-expertise.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

interface RecommendationCriteria {
    budget?: number;
    outfitCount?: number;
    wantsMakeup?: boolean;
    wantsStyling?: boolean;
    preferredType?: 'studio' | 'outdoor';
    isReturning?: boolean;
}

@Injectable()
export class DomainExpertiseService {
    private readonly logger = new Logger(DomainExpertiseService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Get maternity photography best practices
     */
    getBestPractices() {
        return {
            optimalWeeks: {
                min: 28,
                max: 34,
                explanation: "Between 28-34 weeks is ideal for maternity shoots. Your bump is beautifully visible, and you're still comfortable enough to enjoy the session! 💕"
            },
            outfitGuidance: {
                recommended: [
                    "Flowing maxi dresses or gowns",
                    "Form-fitting bodycon dresses",
                    "Soft, stretchy fabrics",
                    "Neutral or pastel colors",
                    "Accessories like flower crowns or sashes"
                ],
                avoid: [
                    "Busy patterns that distract from your bump",
                    "Very stiff or structured fabrics",
                    "Overly baggy clothes that hide your beautiful shape"
                ],
                tip: "We have a selection of maternity gowns available at the studio if you'd like! 🌸"
            },
            comfortTips: [
                "Bring comfortable shoes for between shots",
                "We have seating available for rest breaks",
                "Feel free to bring snacks and water",
                "Let us know if you need any adjustments during the shoot"
            ],
            partnerInvolvement: "Partners and family are always welcome! Many of our packages include couple and family shots. It's a beautiful way to celebrate this journey together! 💖",
            timingAdvice: "Book 2-3 weeks in advance to secure your preferred date and time. Popular slots fill up quickly, especially weekends!"
        };
    }

    /**
     * Handle common objections intelligently
     */
    handleObjection(objection: string, context?: any): string {
        const lower = objection.toLowerCase();

        // Price objections
        if (lower.includes('expensive') || lower.includes('too much') || lower.includes('costly') || lower.includes('afford')) {
            return `I completely understand budget is important! 💕 Here's what makes our packages valuable:\n\n✨ Professional makeup & styling (worth 3,000 KSH alone)\n✨ Edited, high-quality images you'll treasure forever\n✨ Beautiful studio backdrops & props\n✨ Expert photographers who specialize in maternity\n\nWe also have our Standard Package starting at a more accessible price point, and you can always upgrade later! Would you like to see our most budget-friendly options? 🌸`;
        }

        // Timing uncertainty
        if (lower.includes('not sure') && (lower.includes('when') || lower.includes('timing') || lower.includes('week'))) {
            return `No worries at all! 😊 Most mamas shoot between weeks 28-34 of pregnancy. This is when your bump is beautifully round but you're still comfortable.\n\nWhen is your due date? I can help you figure out the perfect timing! Or if you prefer, you can book now and we can adjust the date closer to time (just give us 72 hours notice). 💖`;
        }

        // Body image concerns
        if (lower.includes('look') && (lower.includes('fat') || lower.includes('big') || lower.includes('uncomfortable') || lower.includes('awkward'))) {
            return `Oh mama, I hear you! 💕 But let me reassure you - our photographers are absolute experts at maternity photography. They know all the most flattering angles and poses that celebrate your beautiful bump!\n\nYou're creating life - that's incredible! Our job is to capture that beauty and strength. Every mama who's had concerns has been absolutely thrilled with their photos. You're going to look STUNNING! 🌟\n\nWould you like to see some examples from our portfolio?`;
        }

        // Decision paralysis
        if (lower.includes('which package') || lower.includes('don\'t know which') || lower.includes('help me choose')) {
            return `I'd love to help you choose the perfect package! 💖 Let me ask you a few quick questions:\n\n1. Do you want professional makeup included?\n2. How many outfit changes would you like?\n3. What's your budget range?\n4. Studio or outdoor shoot?\n\nOr I can recommend our most popular package - the Gold Package! It's our best value and includes everything most mamas want. Interested? 🌸`;
        }

        // Rescheduling concerns
        if (lower.includes('reschedule') || lower.includes('change') && lower.includes('date')) {
            return `Absolutely! Life with a baby bump can be unpredictable. 😊 You can reschedule your shoot as long as you give us at least 72 hours notice. Just let us know your new preferred date and we'll make it work! 💕`;
        }

        // Default empathetic response
        return `I totally understand your concern! 💕 Let me connect you with our team who can give you personalized guidance. Or feel free to ask me anything specific - I'm here to help make this as easy and exciting as possible for you! 🌸`;
    }

    /**
     * Provide intelligent package recommendations
     */
    async recommendPackages(criteria: RecommendationCriteria) {
        const allPackages = await this.prisma.package.findMany();
        const scored: Array<{ package: any; score: number; reasons: string[] }> = [];

        for (const pkg of allPackages) {
            let score = 0;
            const reasons: string[] = [];

            // Budget matching
            if (criteria.budget) {
                if (pkg.price <= criteria.budget) {
                    score += 30;
                    reasons.push('Fits your budget');
                } else if (pkg.price <= criteria.budget * 1.2) {
                    score += 15;
                    reasons.push('Slightly above budget but great value');
                }
            }

            // Type preference
            if (criteria.preferredType && pkg.type === criteria.preferredType) {
                score += 20;
                reasons.push(`${criteria.preferredType === 'studio' ? 'Studio' : 'Outdoor'} shoot as preferred`);
            }

            // Makeup preference
            if (criteria.wantsMakeup && pkg.makeup) {
                score += 15;
                reasons.push('Includes professional makeup');
            } else if (criteria.wantsMakeup === false && !pkg.makeup) {
                score += 10;
            }

            // Styling preference
            if (criteria.wantsStyling && pkg.styling) {
                score += 10;
                reasons.push('Includes professional styling');
            }

            // Outfit count
            if (criteria.outfitCount && pkg.outfits >= criteria.outfitCount) {
                score += 15;
                reasons.push(`Supports ${pkg.outfits} outfit changes`);
            }

            // Returning customer bonus
            if (criteria.isReturning) {
                if (pkg.name.toLowerCase().includes('gold') || pkg.name.toLowerCase().includes('platinum')) {
                    score += 10;
                    reasons.push('Premium package for our valued returning customer');
                }
            }

            // Value indicators
            if (pkg.balloonBackdrop) {
                score += 5;
                reasons.push('Includes customized balloon backdrop');
            }
            if (pkg.photobook) {
                score += 5;
                reasons.push('Includes beautiful photobook');
            }

            scored.push({ package: pkg, score, reasons });
        }

        // Sort by score
        scored.sort((a, b) => b.score - a.score);

        // Return top 3 recommendations
        return scored.slice(0, 3).map(item => ({
            ...item.package,
            matchScore: item.score,
            matchReasons: item.reasons,
        }));
    }

    /**
     * Get seasonal advice and promotions
     */
    getSeasonalAdvice(month?: number): string {
        const currentMonth = month || new Date().getMonth() + 1;

        // December - Holiday season
        if (currentMonth === 12) {
            return `🎄 It's the holiday season! We have beautiful Christmas-themed backdrops and props available. Perfect for maternity photos with a festive touch! Book now as December slots fill up fast! ✨`;
        }

        // January/February - Valentine's
        if (currentMonth === 1 || currentMonth === 2) {
            return `💕 Valentine's season is here! Our romantic backdrops and couple shoots are especially popular now. Celebrate your growing love story! 🌹`;
        }

        // June/July/August - Summer
        if (currentMonth >= 6 && currentMonth <= 8) {
            return `☀️ Summer is perfect for outdoor shoots! Our beach location packages are very popular this time of year. The natural lighting is absolutely gorgeous! 🌊`;
        }

        // General
        return `We have beautiful seasonal backdrops and props available year-round. Each season brings its own special charm to your photos! 🌸`;
    }

    /**
     * Provide upselling suggestions based on package
     */
    getUpsellSuggestions(currentPackage: string): string[] {
        const suggestions: string[] = [];
        const lower = currentPackage.toLowerCase();

        if (lower.includes('standard')) {
            suggestions.push(
                "Upgrade to Gold Package for professional makeup & styling - you'll feel like a queen! 👑",
                "Add a customized balloon backdrop for just 2,000 KSH more - makes photos extra special! 🎈",
                "Include a photobook to have physical memories you can hold forever 📖"
            );
        } else if (lower.includes('gold')) {
            suggestions.push(
                "Upgrade to Platinum for more outfit changes and images! 📸",
                "Add our beach outdoor session for stunning natural backdrop photos 🌊",
                "Include partner/family shots to capture the whole journey together 💑"
            );
        } else if (lower.includes('executive')) {
            suggestions.push(
                "Add a styled wig for a completely different look in your photos! 💁‍♀️",
                "Include an A3 mount - perfect for displaying in your home 🖼️",
                "Book a newborn session now and get 10% off! 👶"
            );
        }

        return suggestions;
    }

    /**
     * Answer domain-specific questions
     */
    async answerDomainQuestion(question: string): Promise<string | null> {
        const lower = question.toLowerCase();

        // Check domain knowledge database first
        const knowledge = await this.prisma.domainKnowledge.findFirst({
            where: {
                isActive: true,
                OR: [
                    { triggers: { hasSome: [question.substring(0, 50)] } },
                    { topic: { contains: question.substring(0, 30), mode: 'insensitive' } },
                ],
            },
            orderBy: { priority: 'desc' },
        });

        if (knowledge) {
            await this.prisma.domainKnowledge.update({
                where: { id: knowledge.id },
                data: { usageCount: { increment: 1 } },
            });
            return knowledge.content;
        }

        // Fallback to built-in expertise
        if (lower.includes('what to wear') || lower.includes('outfit')) {
            const practices = this.getBestPractices();
            return `Great question about outfits! 👗\n\n**Recommended:**\n${practices.outfitGuidance.recommended.map(r => `• ${r}`).join('\n')}\n\n**Avoid:**\n${practices.outfitGuidance.avoid.map(a => `• ${a}`).join('\n')}\n\n${practices.outfitGuidance.tip}`;
        }

        if (lower.includes('how long') && (lower.includes('session') || lower.includes('shoot'))) {
            return `Our sessions typically last between 1-2 hours depending on the package. This includes:\n• Makeup & styling (if included)\n• Multiple outfit changes\n• Different poses and backdrops\n• Plenty of breaks for your comfort\n\nWe never rush - it's all about making you feel relaxed and beautiful! 💕`;
        }

        if (lower.includes('bring') || lower.includes('should i')) {
            return `Here's what to bring to your shoot:\n\n✅ Your chosen outfits (2-3 options)\n✅ Comfortable shoes for between shots\n✅ Any special props or accessories\n✅ Snacks and water\n✅ Your partner/family if they're joining\n\nWe provide:\n✨ All backdrops and studio props\n✨ Professional makeup & styling (if in package)\n✨ Maternity gowns (if you'd like to use ours)\n\nJust bring yourself and your beautiful bump! 🌸`;
        }

        return null; // No match found
    }

    /**
     * Seed initial domain knowledge
     */
    async seedDomainKnowledge() {
        const knowledgeEntries = [
            {
                category: 'best_practices',
                subcategory: 'timing',
                topic: 'Best weeks for maternity shoot',
                content: 'The ideal time for a maternity photoshoot is between 28-34 weeks of pregnancy. At this stage, your bump is beautifully round and prominent, but you\'re still comfortable enough to enjoy posing and moving around. We can accommodate earlier or later if needed!',
                triggers: ['when to shoot', 'best time', 'how many weeks', 'timing'],
                applicableIntents: ['faq', 'booking'],
                priority: 9,
            },
            {
                category: 'objection_handling',
                subcategory: 'price',
                topic: 'Price concerns',
                content: 'I understand budget is important! Our packages are designed to provide incredible value - including professional photography, makeup, styling, and edited images that you\'ll treasure forever. We have options starting from our Standard Package, and you can always start smaller and upgrade later. The memories are priceless! 💕',
                triggers: ['expensive', 'too much', 'cost', 'afford', 'price'],
                applicableIntents: ['package_inquiry', 'booking'],
                priority: 8,
            },
            {
                category: 'recommendations',
                subcategory: 'packages',
                topic: 'Most popular package',
                content: 'Our Gold Package is our most popular choice! It includes professional makeup, styling, multiple outfit changes, and a great selection of edited images. It\'s the perfect balance of value and completeness. About 60% of our clients choose this one!',
                triggers: ['popular', 'recommend', 'best package', 'which package'],
                applicableIntents: ['package_inquiry'],
                priority: 7,
            },
            {
                category: 'policies',
                subcategory: 'rescheduling',
                topic: 'Rescheduling policy',
                content: 'You can reschedule your shoot anytime with at least 72 hours notice - no penalty! We understand pregnancy can be unpredictable. Changes made within 72 hours of your shoot time will result in forfeiting the session fee, but we\'re always flexible when we can be! 💖',
                triggers: ['reschedule', 'change date', 'move appointment'],
                applicableIntents: ['booking', 'reschedule'],
                priority: 8,
            },
        ];

        for (const entry of knowledgeEntries) {
            await this.prisma.domainKnowledge.upsert({
                where: { id: entry.topic }, // This will fail first time, but that's ok
                update: entry,
                create: entry as any,
            }).catch(() => {
                // If upsert fails, just create
                return this.prisma.domainKnowledge.create({ data: entry as any });
            });
        }

        this.logger.log(`Seeded ${knowledgeEntries.length} domain knowledge entries`);
    }
}
