"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatisticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const date_fns_1 = require("date-fns");
let StatisticsService = class StatisticsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getActiveUsers() {
        const now = new Date();
        const daily = await this.prisma.customer.count({
            where: { updatedAt: { gte: (0, date_fns_1.subDays)(now, 1) } },
        });
        const weekly = await this.prisma.customer.count({
            where: { updatedAt: { gte: (0, date_fns_1.subWeeks)(now, 1) } },
        });
        const monthly = await this.prisma.customer.count({
            where: { updatedAt: { gte: (0, date_fns_1.subMonths)(now, 1) } },
        });
        return { daily, weekly, monthly };
    }
    async getEngagedCustomers() {
        const customers = await this.prisma.customer.findMany({
            take: 10,
            include: {
                messages: true,
                bookings: true,
            },
        });
        const sorted = customers
            .map(c => ({
            id: c.id,
            name: c.name,
            messages: c.messages.length,
            bookings: c.bookings.length,
            engagement: c.messages.length + c.bookings.length,
        }))
            .sort((a, b) => b.engagement - a.engagement)
            .slice(0, 10);
        return sorted;
    }
    async getPackagePopularity() {
        const packages = await this.prisma.package.findMany();
        const bookingCounts = await this.prisma.booking.groupBy({
            by: ['service'],
            _count: { service: true },
        });
        return packages.map(pkg => {
            const found = bookingCounts.find(b => b.service === pkg.name);
            return {
                id: pkg.id,
                name: pkg.name,
                bookings: found?._count.service || 0,
            };
        });
    }
};
exports.StatisticsService = StatisticsService;
exports.StatisticsService = StatisticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StatisticsService);
//# sourceMappingURL=statistics.service.js.map