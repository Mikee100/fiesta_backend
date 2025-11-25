import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Platinum
  await prisma.package.updateMany({
    where: { name: { contains: 'Platinum', mode: 'insensitive' } },
    data: { deposit: 5000 },
  });
  // VIP
  await prisma.package.updateMany({
    where: { name: { contains: 'VIP', mode: 'insensitive' }, NOT: { name: { contains: 'VVIP', mode: 'insensitive' } } },
    data: { deposit: 10000 },
  });
  // VVIP
  await prisma.package.updateMany({
    where: { name: { contains: 'VVIP', mode: 'insensitive' } },
    data: { deposit: 10000 },
  });
  console.log('Deposits updated for Platinum, VIP, and VVIP packages.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
