import { CalendarService } from './calendar.service';
export declare class CalendarController {
    private readonly calendarService;
    constructor(calendarService: CalendarService);
    getAvailableSlots(date: string, service?: string): Promise<Date[]>;
    syncCalendar(): Promise<void>;
    createEvent(booking: any): Promise<string>;
    updateEvent(eventId: string, booking: any): Promise<void>;
    deleteEvent(eventId: string): Promise<void>;
}
