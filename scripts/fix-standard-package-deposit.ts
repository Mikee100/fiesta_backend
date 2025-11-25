import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check if standard package exists
  const existing = await prisma.package.findFirst({
    where: { name: 'Standard Package' },
  });

  if (existing) {
    // Update if exists
    await prisma.package.update({
      where: { id: existing.id },
      data: {
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
        notes: 'Standard outdoor maternity package.',
        updatedAt: new Date(),
      },
    });
    console.log('Updated existing standard package with deposit configuration.');
  } else {
    // Create if not exists
    await prisma.package.create({
      data: {
        name: 'Standard Package',
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
        notes: 'Standard outdoor maternity package.',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log('Created standard package with deposit configuration.');
  }
}

main()
  .catch((e) => {
    console.error('Error upserting standard package:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
