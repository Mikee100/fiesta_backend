"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const existing = await prisma.package.findFirst({
        where: { name: 'Standard Package' },
    });
    if (existing) {
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
    }
    else {
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
//# sourceMappingURL=fix-standard-package-deposit.js.map