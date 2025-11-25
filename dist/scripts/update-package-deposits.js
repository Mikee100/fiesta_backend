"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    await prisma.package.updateMany({
        where: { name: { contains: 'Platinum', mode: 'insensitive' } },
        data: { deposit: 5000 },
    });
    await prisma.package.updateMany({
        where: { name: { contains: 'VIP', mode: 'insensitive' }, NOT: { name: { contains: 'VVIP', mode: 'insensitive' } } },
        data: { deposit: 10000 },
    });
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
//# sourceMappingURL=update-package-deposits.js.map