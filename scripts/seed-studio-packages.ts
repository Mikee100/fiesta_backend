// scripts/seed-studio-packages.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Studio Packages Only
  const packages = [
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
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: pkg,
    });
  }
  console.log('Studio packages seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
