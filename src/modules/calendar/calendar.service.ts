import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calendar_v3, google } from 'googleapis';
import { DateTime } from 'luxon';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly STUDIO_TZ = 'Africa/Nairobi';
  private calendar: calendar_v3.Calendar;
  private calendarId: string;

  constructor(private prisma: PrismaService) {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
    }
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    this.calendar = google.calendar({ version: 'v3', auth });
    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  }

  async getAvailableSlots(date: Date, service?: string) {
    let duration = 60; // default 60 min
    if (service) {
      const pkg = await this.prisma.package.findFirst({ where: { name: service } });
      if (pkg) duration = parseDurationToMinutes(pkg.duration) || 60;
    }

    // Business hours: 9AM to 5PM, Monday to Friday
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return []; // No slots on weekends
    }

    const dayStart = DateTime.fromJSDate(date).setZone(this.STUDIO_TZ).startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    const dayEnd = dayStart.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

    try {
      // Query Google Calendar for busy times
      const freebusyResponse = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: dayStart.toISO(),
          timeMax: dayEnd.toISO(),
          timeZone: this.STUDIO_TZ,
          items: [{ id: this.calendarId }],
        },
      });

      const busyTimes = freebusyResponse.data.calendars?.[this.calendarId]?.busy || [];

      // Generate potential slots
      const slots: Date[] = [];
      let cursor = dayStart;
      while (cursor < dayEnd) {
        slots.push(cursor.toJSDate());
        cursor = cursor.plus({ minutes: 30 }); // 30-min increments for finer granularity
      }

      // Filter out busy slots
      const availableSlots = slots.filter(slot => {
        const slotStart = DateTime.fromJSDate(slot).setZone(this.STUDIO_TZ);
        const slotEnd = slotStart.plus({ minutes: duration });
        return !busyTimes.some(busy => {
          const busyStart = DateTime.fromISO(busy.start!).setZone(this.STUDIO_TZ);
          const busyEnd = DateTime.fromISO(busy.end!).setZone(this.STUDIO_TZ);
          return slotStart < busyEnd && slotEnd > busyStart;
        });
      });

      return availableSlots;
    } catch (error) {
      this.logger.error('Error fetching available slots from Google Calendar', error);
      throw new Error('Failed to fetch available slots');
    }
  }

  async createEvent(booking: any) {
    const duration = booking.durationMinutes || 60;
    const start = DateTime.fromJSDate(new Date(booking.dateTime)).setZone(this.STUDIO_TZ);
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
    } catch (error) {
      this.logger.error('Error creating Google Calendar event', error);
      throw new Error('Failed to create calendar event');
    }
  }

  async updateEvent(eventId: string, booking: any) {
    const duration = booking.durationMinutes || 60;
    const start = DateTime.fromJSDate(new Date(booking.dateTime)).setZone(this.STUDIO_TZ);
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
    } catch (error) {
      this.logger.error('Error updating Google Calendar event', error);
      throw new Error('Failed to update calendar event');
    }
  }

  async deleteEvent(eventId: string) {
    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId,
      });
      this.logger.log(`Deleted Google Calendar event: ${eventId}`);
    } catch (error) {
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
    } catch (error) {
      this.logger.error('Error syncing calendar', error);
      throw error;
    }
  }

  async getEvents(timeMin?: string, timeMax?: string) {
    try {
      const response = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: timeMin || DateTime.now().setZone(this.STUDIO_TZ).startOf('month').toISO(),
        timeMax: timeMax || DateTime.now().setZone(this.STUDIO_TZ).endOf('month').toISO(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      return response.data.items || [];
    } catch (error) {
      this.logger.error('Error fetching Google Calendar events', error);
      throw new Error('Failed to fetch calendar events');
    }
  }
}

// Helper function (move to utils if needed)
function parseDurationToMinutes(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const hrMatch = duration.match(/(\d+)\s*hr/);
  const minMatch = duration.match(/(\d+)\s*min/);
  let mins = 0;
  if (hrMatch) mins += parseInt(hrMatch[1], 10) * 60;
  if (minMatch) mins += parseInt(minMatch[1], 10);
  return mins || null;
}
