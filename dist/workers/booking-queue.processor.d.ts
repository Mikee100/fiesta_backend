import { Queue } from 'bull';
import { Job } from 'bullmq';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { PrismaService } from '../src/prisma/prisma.service';
export declare class BookingQueueProcessor {
    private bookingsService;
    private prisma;
    private messageQueue;
    private readonly logger;
    private readonly STUDIO_TZ;
    constructor(bookingsService: BookingsService, prisma: PrismaService, messageQueue: Queue);
    process(job: Job<any>): Promise<any>;
}
