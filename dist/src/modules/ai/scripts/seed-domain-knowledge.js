"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function seedDomainKnowledge() {
    console.log('🌱 Seeding domain knowledge...');
    const knowledgeEntries = [
        {
            category: 'best_practices',
            subcategory: 'timing',
            topic: 'Best weeks for maternity shoot',
            content: 'The ideal time for a maternity photoshoot is between 28-34 weeks of pregnancy. At this stage, your bump is beautifully round and prominent, but you\'re still comfortable enough to enjoy posing and moving around. We can accommodate earlier or later if needed! 💕',
            triggers: ['when to shoot', 'best time', 'how many weeks', 'timing', 'when should i'],
            applicableIntents: ['faq', 'booking'],
            priority: 9,
            exampleQuestions: [
                'When is the best time for a maternity shoot?',
                'How many weeks pregnant should I be?',
                'What\'s the ideal timing for maternity photos?'
            ],
            exampleResponses: [
                'Between 28-34 weeks is perfect! Your bump is beautiful and you\'re still comfortable. 💕'
            ],
        },
        {
            category: 'objection_handling',
            subcategory: 'price',
            topic: 'Price concerns',
            content: 'I understand budget is important! Our packages are designed to provide incredible value - including professional photography, makeup, styling, and edited images that you\'ll treasure forever. We have options starting from our Standard Package, and you can always start smaller and upgrade later. The memories are priceless! 💕',
            triggers: ['expensive', 'too much', 'cost', 'afford', 'price', 'cheaper'],
            applicableIntents: ['package_inquiry', 'booking'],
            priority: 8,
            exampleQuestions: [
                'This is too expensive',
                'Do you have anything cheaper?',
                'I can\'t afford this'
            ],
            exampleResponses: [
                'I understand! We have packages starting from more affordable options, and the value includes professional makeup, styling, and edited photos you\'ll treasure forever. 💕'
            ],
        },
        {
            category: 'recommendations',
            subcategory: 'packages',
            topic: 'Most popular package',
            content: 'Our Gold Package is our most popular choice! It includes professional makeup, styling, multiple outfit changes, and a great selection of edited images. It\'s the perfect balance of value and completeness. About 60% of our clients choose this one! ✨',
            triggers: ['popular', 'recommend', 'best package', 'which package', 'most chosen'],
            applicableIntents: ['package_inquiry'],
            priority: 7,
            exampleQuestions: [
                'Which package is most popular?',
                'What do you recommend?',
                'What\'s your best package?'
            ],
            exampleResponses: [
                'Our Gold Package is the most popular! It has everything most mamas want - makeup, styling, multiple outfits, and beautiful edited images. ✨'
            ],
        },
        {
            category: 'policies',
            subcategory: 'rescheduling',
            topic: 'Rescheduling policy',
            content: 'You can reschedule your shoot anytime with at least 72 hours notice - no penalty! We understand pregnancy can be unpredictable. Changes made within 72 hours of your shoot time will result in forfeiting the session fee, but we\'re always flexible when we can be! 💖',
            triggers: ['reschedule', 'change date', 'move appointment', 'different day'],
            applicableIntents: ['booking', 'reschedule'],
            priority: 8,
            exampleQuestions: [
                'Can I reschedule my booking?',
                'What if I need to change the date?',
                'Is there a fee to reschedule?'
            ],
            exampleResponses: [
                'Absolutely! You can reschedule with 72 hours notice - no penalty. We understand pregnancy can be unpredictable! 💖'
            ],
        },
        {
            category: 'best_practices',
            subcategory: 'outfits',
            topic: 'What to wear',
            content: 'Great question! We recommend flowing maxi dresses, form-fitting gowns, or soft stretchy fabrics in neutral or pastel colors. Avoid busy patterns that distract from your beautiful bump. We also have a selection of maternity gowns available at the studio if you\'d like! 🌸',
            triggers: ['what to wear', 'outfit', 'dress', 'clothing', 'what should i bring'],
            applicableIntents: ['faq'],
            priority: 7,
            exampleQuestions: [
                'What should I wear for the shoot?',
                'Do you have outfit recommendations?',
                'What kind of dress should I bring?'
            ],
            exampleResponses: [
                'Flowing maxi dresses or form-fitting gowns work beautifully! We also have maternity gowns available at the studio. 🌸'
            ],
        },
        {
            category: 'best_practices',
            subcategory: 'session_duration',
            topic: 'Session length',
            content: 'Our sessions typically last between 1-2 hours depending on the package. This includes makeup & styling (if included), multiple outfit changes, different poses and backdrops, and plenty of breaks for your comfort. We never rush - it\'s all about making you feel relaxed and beautiful! 💕',
            triggers: ['how long', 'duration', 'session length', 'time'],
            applicableIntents: ['faq'],
            priority: 6,
            exampleQuestions: [
                'How long does the session take?',
                'How much time should I set aside?',
                'What\'s the duration of the shoot?'
            ],
            exampleResponses: [
                'Sessions last 1-2 hours depending on your package. We include makeup, outfit changes, and plenty of breaks. We never rush! 💕'
            ],
        },
        {
            category: 'recommendations',
            subcategory: 'upsells',
            topic: 'Partner involvement',
            content: 'Partners and family are always welcome! Many of our packages include couple and family shots. It\'s a beautiful way to celebrate this journey together! We can add partner shots to any package. 💖',
            triggers: ['partner', 'husband', 'family', 'couple shots', 'together'],
            applicableIntents: ['package_inquiry', 'booking'],
            priority: 6,
            exampleQuestions: [
                'Can my partner join?',
                'Do you do couple shots?',
                'Can we include family?'
            ],
            exampleResponses: [
                'Absolutely! Partners and family are always welcome. Many packages include couple shots - it\'s a beautiful way to celebrate together! 💖'
            ],
        },
        {
            category: 'seasonal',
            subcategory: 'promotions',
            topic: 'Seasonal offerings',
            content: 'We have beautiful seasonal backdrops and props available year-round! Each season brings its own special charm. Right now we have gorgeous options that will make your photos extra special. 🌸',
            triggers: ['seasonal', 'special', 'promotion', 'offer', 'discount'],
            applicableIntents: ['package_inquiry'],
            priority: 5,
            exampleQuestions: [
                'Do you have any specials?',
                'Are there seasonal options?',
                'Any promotions running?'
            ],
            exampleResponses: [
                'We have beautiful seasonal backdrops available! Each season brings special charm to your photos. 🌸'
            ],
        },
    ];
    let added = 0;
    let updated = 0;
    for (const entry of knowledgeEntries) {
        try {
            const existing = await prisma.domainKnowledge.findFirst({
                where: { topic: entry.topic },
            });
            if (existing) {
                await prisma.domainKnowledge.update({
                    where: { id: existing.id },
                    data: entry,
                });
                updated++;
                console.log(`✅ Updated: ${entry.topic}`);
            }
            else {
                await prisma.domainKnowledge.create({
                    data: entry,
                });
                added++;
                console.log(`✨ Added: ${entry.topic}`);
            }
        }
        catch (error) {
            console.error(`❌ Error with "${entry.topic}":`, error.message);
        }
    }
    console.log(`\n🎉 Domain knowledge seeding complete!`);
    console.log(`   Added: ${added} new entries`);
    console.log(`   Updated: ${updated} existing entries`);
    console.log(`   Total: ${added + updated} entries`);
}
seedDomainKnowledge()
    .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-domain-knowledge.js.map