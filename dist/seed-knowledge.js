"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ai_service_1 = require("./src/modules/ai/ai.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
const config_1 = require("@nestjs/config");
async function seedKnowledge() {
    const configService = new config_1.ConfigService();
    const prisma = new prisma_service_1.PrismaService();
    const aiService = new ai_service_1.AiService(configService, prisma, null, null);
    const outdoorPackages = [
        {
            question: 'What are your outdoor packages?',
            answer: `Our outdoor maternity packages are designed to celebrate your beautiful journey in natural settings. Here are our options:

⭐ Standard Package — KSH 20,000
- 2 hrs session
- 15 soft copy images
- Professional Makeup
- 2 of your own outfits & Styling

⭐ Economy Package — KSH 25,000
- 2 hrs 30 mins session
- 20 soft copy images
- Professional Makeup
- 3 of your own outfits & Styling

⭐ Executive Package — KSH 35,000
- 2 hrs 30 mins session
- 25 soft copy images
- Professional Makeup
- 4 of your own outfits & Styling
- 8x8" Photobook (hard pages)

All outdoor packages include professional photography to capture your glow in beautiful natural locations.`
        },
        {
            question: 'Tell me about outdoor maternity packages',
            answer: `Our outdoor maternity packages let you celebrate your pregnancy in stunning natural environments. We have three beautiful options:

⭐ Standard Package — KSH 20,000: 2 hours, 15 edited images, makeup, 2 outfits
⭐ Economy Package — KSH 25,000: 2.5 hours, 20 edited images, makeup, 3 outfits
⭐ Executive Package — KSH 35,000: 2.5 hours, 25 edited images, makeup, 4 outfits, photobook

Each session is tailored to make you feel special and capture your radiance.`
        },
        {
            question: 'What outdoor packages do you offer?',
            answer: `We offer three outdoor maternity photography packages:

1. Standard Package (KSH 20,000): 2 hrs, 15 images, makeup, 2 outfits
2. Economy Package (KSH 25,000): 2.5 hrs, 20 images, makeup, 3 outfits
3. Executive Package (KSH 35,000): 2.5 hrs, 25 images, makeup, 4 outfits, photobook

Perfect for celebrating your pregnancy in nature's beauty!`
        }
    ];
    const studioPackages = [
        {
            question: 'What are your studio packages?',
            answer: `Our indoor studio packages provide a comfortable, controlled environment for your maternity photos. Here are our options:

⭐ Standard Package — KSH 10,000
- 1 hr 30 mins session
- 6 soft copy images
- Professional Makeup
- 2 of your own outfits & Styling

⭐ Economy Package — KSH 15,000
- 2 hrs session
- 12 soft copy images
- Professional Makeup
- 3 of your own outfits & Styling

⭐ Executive Package — KSH 20,000
- 2 hrs 30 mins session
- 15 soft copy images
- Professional Makeup
- 4 of your own outfits & Styling
- 1 A3 mount

⭐ Gold Package — KSH 30,000
- 2 hrs 30 mins session
- 20 soft copy images
- Professional Makeup
- 4 of your own outfits & Styling
- 8x8" Photobook (hard pages)

⭐ Platinum Package — KSH 35,000
- 2 hrs 30 mins session
- 25 soft copy images
- Professional Makeup
- Customised Balloon Backdrop with flowers
- 4 of your own outfits & Styling
- 1 A3 mount

⭐ VIP Package — KSH 45,000
- 3 hrs 30 mins session
- 25 soft copy images
- Professional Makeup
- Customised Balloon Backdrop with flowers
- 4 of your own outfits & Styling
- 8x8" Photobook (hard pages)

⭐ VVIP Package — KSH 50,000
- 3 hrs 30 mins session
- 30 soft copy images
- Professional Makeup
- Customised Balloon Backdrop with flowers
- 5 of your own outfits & Styling
- 1 A3 mount
- 8x8" Photobook (hard pages)
- 1 Styled Wig

All studio packages are held at our beautiful location: 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor.`
        },
        {
            question: 'Tell me about studio maternity packages',
            answer: `Our studio maternity packages offer a luxurious, stress-free experience indoors. We have seven packages ranging from intimate sessions to full VIP experiences:

⭐ Standard (KSH 10,000): 1.5 hrs, 6 images, makeup, 2 outfits
⭐ Economy (KSH 15,000): 2 hrs, 12 images, makeup, 3 outfits
⭐ Executive (KSH 20,000): 2.5 hrs, 15 images, makeup, 4 outfits, A3 mount
⭐ Gold (KSH 30,000): 2.5 hrs, 20 images, makeup, 4 outfits, photobook
⭐ Platinum (KSH 35,000): 2.5 hrs, 25 images, makeup, balloon backdrop, 4 outfits, A3 mount
⭐ VIP (KSH 45,000): 3.5 hrs, 25 images, makeup, balloon backdrop, 4 outfits, photobook
⭐ VVIP (KSH 50,000): 3.5 hrs, 30 images, makeup, balloon backdrop, 5 outfits, A3 mount, photobook, wig

Each package is designed to make you feel like the queen you are!`
        },
        {
            question: 'What studio packages do you offer?',
            answer: `We offer seven studio maternity photography packages:

1. Standard (KSH 10,000): 1.5 hrs, 6 images
2. Economy (KSH 15,000): 2 hrs, 12 images
3. Executive (KSH 20,000): 2.5 hrs, 15 images, A3 mount
4. Gold (KSH 30,000): 2.5 hrs, 20 images, photobook
5. Platinum (KSH 35,000): 2.5 hrs, 25 images, balloon backdrop, A3 mount
6. VIP (KSH 45,000): 3.5 hrs, 25 images, balloon backdrop, photobook
7. VVIP (KSH 50,000): 3.5 hrs, 30 images, balloon backdrop, A3 mount, photobook, wig

Located at 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor.`
        }
    ];
    const generalPackages = [
        {
            question: 'What packages do you offer?',
            answer: `We offer beautiful maternity photography packages for both outdoor and studio settings. 

OUTDOOR PACKAGES:
⭐ Standard Package — KSH 20,000 (2 hrs, 15 images)
⭐ Economy Package — KSH 25,000 (2.5 hrs, 20 images)
⭐ Executive Package — KSH 35,000 (2.5 hrs, 25 images, photobook)

STUDIO PACKAGES:
⭐ Standard Package — KSH 10,000 (1.5 hrs, 6 images)
⭐ Economy Package — KSH 15,000 (2 hrs, 12 images)
⭐ Executive Package — KSH 20,000 (2.5 hrs, 15 images, A3 mount)
⭐ Gold Package — KSH 30,000 (2.5 hrs, 20 images, photobook)
⭐ Platinum Package — KSH 35,000 (2.5 hrs, 25 images, balloon backdrop, A3 mount)
⭐ VIP Package — KSH 45,000 (3.5 hrs, 25 images, balloon backdrop, photobook)
⭐ VVIP Package — KSH 50,000 (3.5 hrs, 30 images, balloon backdrop, A3 mount, photobook, wig)

All packages include professional makeup and styling. Studio location: 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor.`
        },
        {
            question: 'How much do your packages cost?',
            answer: `Our maternity photography packages range from KSH 10,000 to KSH 50,000:

OUTDOOR: KSH 20,000 - 35,000
STUDIO: KSH 10,000 - 50,000

Standard Studio: KSH 10,000
Economy Studio: KSH 15,000
Executive Studio: KSH 20,000
Gold Studio: KSH 30,000
Platinum Studio: KSH 35,000
VIP Studio: KSH 45,000
VVIP Studio: KSH 50,000

Standard Outdoor: KSH 20,000
Economy Outdoor: KSH 25,000
Executive Outdoor: KSH 35,000

Each package includes professional services tailored to celebrate your pregnancy journey.`
        },
        {
            question: 'What is included in your packages?',
            answer: `All our maternity packages include:
- Professional maternity photographer
- Professional makeup artist
- Hair and styling services
- Edited digital images
- Your choice of outfits (we provide styling)

Additional inclusions vary by package:
- Photobooks (Executive Outdoor, Gold/VIP/VVIP Studio)
- A3 mounts (Executive/Platinum/VVIP Studio)
- Balloon backdrops (Platinum/VIP/VVIP Studio)
- Styled wigs (VVIP Studio)

Extra services available: additional images (KSH 500 each), digital art edits (KSH 2,000), extra outfits (KSH 2,500).`
        }
    ];
    const allKnowledge = [...outdoorPackages, ...studioPackages, ...generalPackages];
    for (const item of allKnowledge) {
        try {
            await aiService.addKnowledge(item.question, item.answer);
            console.log(`Added knowledge: ${item.question}`);
        }
        catch (error) {
            console.error(`Failed to add knowledge for: ${item.question}`, error);
        }
    }
    console.log('Knowledge base seeding completed!');
    await prisma.$disconnect();
}
seedKnowledge().catch(console.error);
//# sourceMappingURL=seed-knowledge.js.map