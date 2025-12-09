
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { subDays, subWeeks, subMonths } from 'date-fns';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getActiveUsers() {
    const now = new Date();
    const daily = await this.prisma.customer.count({
      where: { updatedAt: { gte: subDays(now, 1) } },
    });
    const weekly = await this.prisma.customer.count({
      where: { updatedAt: { gte: subWeeks(now, 1) } },
    });
    const monthly = await this.prisma.customer.count({
      where: { updatedAt: { gte: subMonths(now, 1) } },
    });
    return { daily, weekly, monthly };
  }

  async getEngagedCustomers() {
    // Top 10 customers by messages and bookings
    const customers = await this.prisma.customer.findMany({
      take: 10,
      include: {
        messages: true,
        bookings: true,
      },
    });
    // Sort by combined engagement (messages + bookings)
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
    // Aggregate bookings by service (package name)
    const packages = await this.prisma.package.findMany();
    const bookingCounts = await this.prisma.booking.groupBy({
      by: ['service'],
      _count: { service: true },
    });
    // Map package names to booking counts
    return packages.map(pkg => {
      const found = bookingCounts.find(b => b.service === pkg.name);
      return {
        id: pkg.id,
        name: pkg.name,
        bookings: found?._count.service || 0,
      };
    });
  }
}
