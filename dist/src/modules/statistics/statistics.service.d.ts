import { PrismaService } from '../../prisma/prisma.service';
export declare class StatisticsService {
    private prisma;
    constructor(prisma: PrismaService);
    getActiveUsers(): Promise<{
        daily: number;
        weekly: number;
        monthly: number;
    }>;
    getEngagedCustomers(): Promise<{
        id: string;
        name: string;
        messages: number;
        bookings: number;
        engagement: number;
    }[]>;
    getPackagePopularity(): Promise<{
        id: string;
        name: string;
        bookings: number;
    }[]>;
}
