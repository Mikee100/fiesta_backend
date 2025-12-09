import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { ContentScraperService } from '../content-scraper/content-scraper.service';

@Injectable()
export class SeedingService {
    private readonly logger = new Logger(SeedingService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiService: AiService,
        private readonly configService: ConfigService,
        private readonly scraperService: ContentScraperService,
    ) { }

    // Automatic seeding on startup removed. To seed manually, call the methods as needed.

    async seedPackages() {
        this.logger.log('Seeding packages...');

        // Combined list of packages (Studio + Outdoor)
        const packages = [
            // Studio Packages
            {
                name: 'Standard Package',
                type: 'studio',
                price: 10000,
                deposit: 2000,
                duration: '1 hr 30 mins',
                images: 6,
                makeup: true,
                outfits: 2,
                styling: true,
                photobook: false,
                photobookSize: null,
                mount: false,
                balloonBackdrop: false,
                wig: false,
                notes: 'Standard indoor studio maternity package.',
            },
            {
                name: 'Economy Package',
                type: 'studio',
                price: 15000,
                deposit: 2000,
                duration: '2 hrs',
                images: 12,
                makeup: true,
                outfits: 3,
                styling: true,
                photobook: false,
                photobookSize: null,
                mount: false,
                balloonBackdrop: false,
                wig: false,
                notes: 'Economy indoor studio maternity package.',
            },
            {
                name: 'Executive Package',
                type: 'studio',
                price: 20000,
                deposit: 2000,
                duration: '2 hrs 30 mins',
                images: 15,
                makeup: true,
                outfits: 4,
                styling: true,
                photobook: false,
                photobookSize: null,
                mount: true,
                balloonBackdrop: false,
                wig: false,
                notes: 'Executive indoor studio maternity package with A3 mount.',
            },
            {
                name: 'Gold Package',
                type: 'studio',
                price: 30000,
                deposit: 2000,
                duration: '2 hrs 30 mins',
                images: 20,
                makeup: true,
                outfits: 4,
                styling: true,
                photobook: true,
                photobookSize: '8x8"',
                mount: false,
                balloonBackdrop: false,
                wig: false,
                notes: 'Gold indoor studio maternity package with photobook.',
            },
            {
                name: 'Platinum Package',
                type: 'studio',
                price: 35000,
                deposit: 2000,
                duration: '2 hrs 30 mins',
                images: 25,
                makeup: true,
                outfits: 4,
                styling: true,
                photobook: false,
                photobookSize: null,
                mount: true,
                balloonBackdrop: true,
                wig: false,
                notes: 'Platinum indoor studio maternity package with balloon backdrop and A3 mount.',
            },
            {
                name: 'VIP Package',
                type: 'studio',
                price: 45000,
                deposit: 2000,
                duration: '3 hrs 30 mins',
                images: 25,
                makeup: true,
                outfits: 4,
                styling: true,
                photobook: true,
                photobookSize: '8x8"',
                mount: false,
                balloonBackdrop: true,
                wig: false,
                notes: 'VIP indoor studio maternity package with balloon backdrop and photobook.',
            },
            {
                name: 'VVIP Package',
                type: 'studio',
                price: 50000,
                deposit: 2000,
                duration: '3 hrs 30 mins',
                images: 30,
                makeup: true,
                outfits: 5,
                styling: true,
                photobook: true,
                photobookSize: '8x8"',
                mount: true,
                balloonBackdrop: true,
                wig: true,
                notes: 'VVIP indoor studio maternity package with balloon backdrop, A3 mount, photobook, and styled wig.',
            },
            // Outdoor Packages
            {
                name: 'Standard Outdoor Package',
                type: 'outdoor',
                price: 20000,
                deposit: 2000,
                duration: '2 hrs',
                images: 15,
                makeup: true,
                outfits: 2,
                styling: true,
                photobook: false,
                photobookSize: null,
                mount: false,
                balloonBackdrop: false,
                wig: false,
                notes: 'Standard outdoor maternity photography package.',
            },
            {
                name: 'Economy Outdoor Package',
                type: 'outdoor',
                price: 25000,
                deposit: 2000,
                duration: '2 hrs 30 mins',
                images: 20,
                makeup: true,
                outfits: 3,
                styling: true,
                photobook: false,
                photobookSize: null,
                mount: false,
                balloonBackdrop: false,
                wig: false,
                notes: 'Economy outdoor maternity photography package.',
            },
            {
                name: 'Executive Outdoor Package',
                type: 'outdoor',
                price: 35000,
                deposit: 2000,
                duration: '2 hrs 30 mins',
                images: 25,
                makeup: true,
                outfits: 4,
                styling: true,
                photobook: true,
                photobookSize: '8x8"',
                mount: false,
                balloonBackdrop: false,
                wig: false,
                notes: 'Executive outdoor maternity photography package with photobook.',
            },
        ];

        for (const pkg of packages) {
            await this.prisma.package.upsert({
                where: { name: pkg.name },
                update: pkg,
                create: pkg,
            });
        }
        this.logger.log(`Packages seeded/updated: ${packages.length}`);
    }

    async seedKnowledgeBase() {
        this.logger.log('Seeding knowledge base...');

        // Outdoor packages knowledge
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

        // Studio packages knowledge
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

        // General package knowledge
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
            },
            {
                question: 'Can I bring my family members for the shoot?',
                answer: `Yes, absolutely! Partners and family members are always welcome to join your photoshoot. Many of our packages include couple and family shots - it's a beautiful way to celebrate this journey together! 💖

You can bring:
- Your partner/spouse
- Children
- Other family members

We love capturing these precious moments with your loved ones! Just let us know when you book so we can plan accordingly.`
            },
            {
                question: 'Can I bring my partner to the photoshoot?',
                answer: `Absolutely! Partners are always welcome and we encourage it! Many of our packages include couple shots - it's such a beautiful way to celebrate this journey together. 💖

Your partner can join you for the entire session, and we'll capture beautiful moments of you both. Just let us know when you book so we can plan accordingly!`
            },
            {
                question: 'What can I bring to my photoshoot?',
                answer: `Here's what you can bring to your shoot:

✅ Your chosen outfits (2-3 options)
✅ Comfortable shoes for between shots
✅ Any special props or accessories
✅ Snacks and water
✅ Your partner/family if they're joining

We provide:
✨ All backdrops and studio props
✨ Professional makeup & styling (if in package)
✨ Maternity gowns (if you'd like to use ours)

Just bring yourself and your beautiful bump! 🌸`
            }
        ];

        const allKnowledge = [...outdoorPackages, ...studioPackages, ...generalPackages];

        for (const item of allKnowledge) {
            // Use AiService to generate embedding and manage Pinecone, BUT wrapped in our logic
            // Actually, since we updated AiService.addKnowledge to accept explicit category and use upsert, we can just call it.
            // But we need to ensure it doesn't fail on duplicates if schema change hasn't applied.
            // aiService.addKnowledge logic now does upsert.
            try {
                await this.aiService.addKnowledge(item.question, item.answer, 'packages');
            } catch (e) {
                this.logger.warn(`Failed to seed knowledge: ${item.question}`, e);
            }
        }
        this.logger.log('Knowledge base seeding completed.');
    }

    async seedScrapedContent() {
        this.logger.log('Seeding scraped content...');
        try {
            const result = await this.scraperService.scrapeAllContent();
            this.logger.log(`Scraping result: ${result.imagesScraped} images, ${result.faqsAdded} FAQs`);
            if (result.errors.length > 0) {
                this.logger.warn(`Scraping errors: ${result.errors.join(', ')}`);
            }
        } catch (error) {
            this.logger.error('Failed to seed scraped content', error);
        }
    }
}
