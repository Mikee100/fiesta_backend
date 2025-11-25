import { PrismaService } from '../../prisma/prisma.service';
export declare class CalendarService {
    private prisma;
    private readonly logger;
    private readonly STUDIO_TZ;
    private calendar;
    private calendarId;
    constructor(prisma: PrismaService);
    getAvailableSlots(date: Date, service?: string): Promise<Date[]>;
    createEvent(booking: any): Promise<string>;
    updateEvent(eventId: string, booking: any): Promise<void>;
    deleteEvent(eventId: string): Promise<void>;
    syncCalendar(): Promise<void>;
}
