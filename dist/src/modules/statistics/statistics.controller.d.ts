import { StatisticsService } from './statistics.service';
export declare class StatisticsController {
    private readonly statisticsService;
    constructor(statisticsService: StatisticsService);
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
