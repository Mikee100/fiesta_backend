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
var CalendarService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const googleapis_1 = require("googleapis");
const luxon_1 = require("luxon");
let CalendarService = CalendarService_1 = class CalendarService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CalendarService_1.name);
        this.STUDIO_TZ = 'Africa/Nairobi';
        const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
        }
        const credentials = JSON.parse(serviceAccountKey);
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        this.calendar = googleapis_1.google.calendar({ version: 'v3', auth });
        this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    }
    async getAvailableSlots(date, service) {
        let duration = 60;
        if (service) {
            const pkg = await this.prisma.package.findFirst({ where: { name: service } });
            if (pkg)
                duration = parseDurationToMinutes(pkg.duration) || 60;
        }
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return [];
        }
        const dayStart = luxon_1.DateTime.fromJSDate(date).setZone(this.STUDIO_TZ).startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
        const dayEnd = dayStart.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
        try {
            const freebusyResponse = await this.calendar.freebusy.query({
                requestBody: {
                    timeMin: dayStart.toISO(),
                    timeMax: dayEnd.toISO(),
                    timeZone: this.STUDIO_TZ,
                    items: [{ id: this.calendarId }],
                },
            });
            const busyTimes = freebusyResponse.data.calendars?.[this.calendarId]?.busy || [];
            const slots = [];
            let cursor = dayStart;
            while (cursor < dayEnd) {
                slots.push(cursor.toJSDate());
                cursor = cursor.plus({ minutes: 30 });
            }
            const availableSlots = slots.filter(slot => {
                const slotStart = luxon_1.DateTime.fromJSDate(slot).setZone(this.STUDIO_TZ);
                const slotEnd = slotStart.plus({ minutes: duration });
                return !busyTimes.some(busy => {
                    const busyStart = luxon_1.DateTime.fromISO(busy.start).setZone(this.STUDIO_TZ);
                    const busyEnd = luxon_1.DateTime.fromISO(busy.end).setZone(this.STUDIO_TZ);
                    return slotStart < busyEnd && slotEnd > busyStart;
                });
            });
            return availableSlots;
        }
        catch (error) {
            this.logger.error('Error fetching available slots from Google Calendar', error);
            throw new Error('Failed to fetch available slots');
        }
    }
    async createEvent(booking) {
        const duration = booking.durationMinutes || 60;
        const start = luxon_1.DateTime.fromJSDate(new Date(booking.dateTime)).setZone(this.STUDIO_TZ);
        const end = start.plus({ minutes: duration });
        const event = {
            summary: `${booking.customer.name} - ${booking.service}`,
            description: `Booking for ${booking.customer.name}. Service: ${booking.service}. Phone: ${booking.customer.phone || 'N/A'}. Recipient: ${booking.recipientName || booking.customer.name} (${booking.recipientPhone || 'N/A'})`,
            start: {
                dateTime: start.toISO(),
                timeZone: this.STUDIO_TZ,
            },
            end: {
                dateTime: end.toISO(),
                timeZone: this.STUDIO_TZ,
            },
        };
        try {
            const response = await this.calendar.events.insert({
                calendarId: this.calendarId,
                requestBody: event,
            });
            this.logger.log(`Created Google Calendar event: ${response.data.id}`);
            return response.data.id;
        }
        catch (error) {
            this.logger.error('Error creating Google Calendar event', error);
            throw new Error('Failed to create calendar event');
        }
    }
    async updateEvent(eventId, booking) {
        const duration = booking.durationMinutes || 60;
        const start = luxon_1.DateTime.fromJSDate(new Date(booking.dateTime)).setZone(this.STUDIO_TZ);
        const end = start.plus({ minutes: duration });
        const event = {
            summary: `${booking.customer.name} - ${booking.service}`,
            description: `Booking for ${booking.customer.name}. Service: ${booking.service}. Phone: ${booking.customer.phone || 'N/A'}. Recipient: ${booking.recipientName || booking.customer.name} (${booking.recipientPhone || 'N/A'})`,
            start: {
                dateTime: start.toISO(),
                timeZone: this.STUDIO_TZ,
            },
            end: {
                dateTime: end.toISO(),
                timeZone: this.STUDIO_TZ,
            },
        };
        try {
            await this.calendar.events.update({
                calendarId: this.calendarId,
                eventId,
                requestBody: event,
            });
            this.logger.log(`Updated Google Calendar event: ${eventId}`);
        }
        catch (error) {
            this.logger.error('Error updating Google Calendar event', error);
            throw new Error('Failed to update calendar event');
        }
    }
    async deleteEvent(eventId) {
        try {
            await this.calendar.events.delete({
                calendarId: this.calendarId,
                eventId,
            });
            this.logger.log(`Deleted Google Calendar event: ${eventId}`);
        }
        catch (error) {
            this.logger.error('Error deleting Google Calendar event', error);
            throw new Error('Failed to delete calendar event');
        }
    }
    async syncCalendar() {
        this.logger.log('Syncing existing bookings to Google Calendar...');
        try {
            const bookings = await this.prisma.booking.findMany({
                where: { status: 'confirmed', googleEventId: null },
                include: { customer: true },
            });
            for (const booking of bookings) {
                const eventId = await this.createEvent(booking);
                await this.prisma.booking.update({
                    where: { id: booking.id },
                    data: { googleEventId: eventId },
                });
            }
            this.logger.log(`Synced ${bookings.length} bookings to Google Calendar`);
        }
        catch (error) {
            this.logger.error('Error syncing calendar', error);
            throw error;
        }
    }
    async getEvents(timeMin, timeMax) {
        try {
            const response = await this.calendar.events.list({
                calendarId: this.calendarId,
                timeMin: timeMin || luxon_1.DateTime.now().setZone(this.STUDIO_TZ).startOf('month').toISO(),
                timeMax: timeMax || luxon_1.DateTime.now().setZone(this.STUDIO_TZ).endOf('month').toISO(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            return response.data.items || [];
        }
        catch (error) {
            this.logger.error('Error fetching Google Calendar events', error);
            throw new Error('Failed to fetch calendar events');
        }
    }
};
exports.CalendarService = CalendarService;
exports.CalendarService = CalendarService = CalendarService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CalendarService);
function parseDurationToMinutes(duration) {
    if (!duration)
        return null;
    const hrMatch = duration.match(/(\d+)\s*hr/);
    const minMatch = duration.match(/(\d+)\s*min/);
    let mins = 0;
    if (hrMatch)
        mins += parseInt(hrMatch[1], 10) * 60;
    if (minMatch)
        mins += parseInt(minMatch[1], 10);
    return mins || null;
}
//# sourceMappingURL=calendar.service.js.map