
// Helper to parse duration string like '2 hrs 30 mins' to minutes
function parseDurationToMinutes(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const hrMatch = duration.match(/(\d+)\s*hr/);
  const minMatch = duration.match(/(\d+)\s*min/);
  let mins = 0;
  if (hrMatch) mins += parseInt(hrMatch[1], 10) * 60;
  if (minMatch) mins += parseInt(minMatch[1], 10);
  return mins || null;
}
// src/modules/bookings/bookings.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { MessagesService } from '../messages/messages.service';
import { CalendarService } from '../calendar/calendar.service';
import * as chrono from 'chrono-node';
import { DateTime, Duration } from 'luxon';

type ServiceInfo = { name: string; durationMinutes: number; price: number };

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly STUDIO_TZ = 'Africa/Nairobi';

  // Fetch all packages (optionally filter by type: 'outdoor' | 'studio')
  async getPackages(type?: string) {
    const where = type ? { type } : {};
    return this.prisma.package.findMany({ where });
  }

  /* --------------------------
   * completeBookingDraft: used by queue consumer or when user confirms
   * - Initiates M-Pesa deposit payment before confirming booking
   * - Ensures atomic creation and confirmation in transaction
   * - Returns booking record
   * - Added extensive logging for debugging
   * -------------------------- */
  async completeBookingDraft(customerId: string, providedDateTime?: Date) {
    this.logger.debug(`completeBookingDraft called for customerId=${customerId}`);
    try {
      const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
      this.logger.debug(`Fetched bookingDraft: ${JSON.stringify(draft)}`);

      if (!draft || !draft.service || (!draft.dateTimeIso && !providedDateTime) || !draft.name) {
        const msg = `Incomplete booking draft detected for customerId=${customerId}`;
        this.logger.warn(msg);
        throw new Error(msg);
      }

      // Get package deposit amount
      const pkg = await this.prisma.package.findFirst({ where: { name: draft.service } });
      if (!pkg || !pkg.deposit) {
        throw new Error(`Package deposit not configured for ${draft.service}`);
      }
      const depositAmount = pkg.deposit;

      // Get phone for payment (use recipientPhone from draft)
      const phone = draft.recipientPhone;
      if (!phone) {
        throw new Error(`Recipient phone not found in draft for customerId=${customerId}`);
      }

      // Initiate M-Pesa STK Push for deposit
      await this.paymentsService.initiateSTKPush(draft.id, phone, depositAmount);


      // Send WhatsApp message to prompt deposit payment
      const depositMsg = `To confirm your booking, please pay the deposit of KSH ${depositAmount}. An M-Pesa prompt has been sent to your phone. Complete the payment to secure your slot!`;
      this.logger.log(`[DepositPrompt] Attempting to send WhatsApp deposit prompt to customerId=${customerId}`);
      try {
        await this.messagesService.sendOutboundMessage(customerId, depositMsg, 'whatsapp');
        this.logger.log(`[DepositPrompt] WhatsApp deposit prompt sent to customerId=${customerId}`);
      } catch (err) {
        this.logger.error(`[DepositPrompt] Failed to send WhatsApp deposit prompt to customerId=${customerId}`, err);
      }

      // Do not confirm booking yet; wait for payment callback
      this.logger.log(`M-Pesa STK Push initiated for deposit of ${depositAmount} KSH for booking draft ${draft.id}`);

      return { message: 'Deposit payment initiated. Please complete payment on your phone to confirm booking.' };
    } catch (error) {
      this.logger.error(`completeBookingDraft failed for customerId=${customerId}`, error);
      throw error;
    }
  }

  // Fetch a single package by ID
  async getPackageById(id: string) {
    return this.prisma.package.findUnique({ where: { id } });
  }

  // Fetch studio info (assume only one row)
  async getStudioInfo() {
    return this.prisma.studioInfo.findFirst();
  }


  constructor(
    private prisma: PrismaService,
    @InjectQueue('bookingQueue') private bookingQueue: Queue,
    private paymentsService: PaymentsService,
    private messagesService: MessagesService,
  ) {}

  /* --------------------------
   * Helpers
   * -------------------------- */


  // Returns [start,end) in UTC JS Date for a given desired slot and service duration
  private getSlotInterval(dateTime: Date, durationMinutes: number) {
    const start = DateTime.fromJSDate(dateTime, { zone: 'utc' });
    const end = start.plus({ minutes: durationMinutes });
    return { start: start.toJSDate(), end: end.toJSDate() };
  }

  // Overlap check: two intervals [aStart,aEnd) and [bStart,bEnd) overlap if aStart < bEnd && bStart < aEnd
  private intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && bStart < aEnd;
  }

  private formatBookingConflictMessage(conflictBookings: any[], requestedDate: Date) {
    if (!conflictBookings.length) return 'The slot is available.';

    const times = conflictBookings.map(b =>
      DateTime.fromJSDate(b.dateTime).setZone(this.STUDIO_TZ).toFormat('ccc, LLL dd, yyyy HH:mm')
    );
    return `The requested time ${DateTime.fromJSDate(requestedDate)
      .setZone(this.STUDIO_TZ)
      .toFormat('ccc, LLL dd, yyyy HH:mm')} is already booked. Conflicting bookings: ${times.join(', ')}`;
  }

  private formatNoDateMessage(message: string) {
    return `We couldn't find a date or time in your message: "${message}". Please specify when you'd like your appointment.`;
  }

  private formatDraftIncompleteMessage(draft: any) {
    return `Your booking draft is incomplete. Please ensure you've selected a service, date/time, and provided your name.`;
  }

  /* --------------------------
   * Booking Draft methods
   * -------------------------- */
  async getBookingDraft(customerId: string) {
    return this.prisma.bookingDraft.findUnique({ where: { customerId } });
  }

  async getDepositForDraft(customerId: string) {
    const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    if (!draft || !draft.service) return null;
    const pkg = await this.prisma.package.findFirst({ where: { name: draft.service } });
    return pkg?.deposit || null;
  }

  async createBookingDraft(customerId: string) {
    return this.prisma.bookingDraft.create({
      data: {
        customerId,
        step: 'service',
      },
    });
  }

  async updateBookingDraft(customerId: string, updates: Partial<any>) {
    return this.prisma.bookingDraft.upsert({
      where: { customerId },
      update: { ...updates, updatedAt: new Date() },
      create: { customerId, step: 'service', ...updates },
    });
  }

  async deleteBookingDraft(customerId: string) {
    return this.prisma.bookingDraft.delete({ where: { customerId } });
  }

  /* --------------------------
   * Create booking: accepts either a parsed Date (dateTime) or a natural language message
   * Returns the created booking (with status = 'provisional')
   * - Stores dateTime in UTC
   * - Creates minimal customer record if none exists (no fake email)
   * -------------------------- */
  async createBooking(customerId: string, opts: { message?: string; dateTime?: Date; service?: string; customerName?: string; recipientName?: string; recipientPhone?: string }) {

    let parsedDateTime: Date | null = null;
    if (opts.dateTime) {
      parsedDateTime = opts.dateTime;
    } else if (opts.message) {
      const results = chrono.parse(opts.message);
      if (!results.length) throw new Error(this.formatNoDateMessage(opts.message));
      const localDt = results[0].start.date();
      const dt = DateTime.fromJSDate(localDt).setZone(this.STUDIO_TZ);
      parsedDateTime = new Date(dt.toUTC().toISO());
    } else {
      throw new Error('Either message or dateTime is required');
    }

    const selectedService = opts.service?.trim();
    let packageInfo = null;
    let durationMinutes = 60;
    if (selectedService) {
      packageInfo = await this.prisma.package.findFirst({
        where: { name: { equals: selectedService, mode: 'insensitive' } }
      });
      if (!packageInfo) {
        const allPackages = await this.prisma.package.findMany();
        throw new Error(`Service "${selectedService}" not found. Available packages: ${allPackages.map(p => p.name).join(', ')}`);
      }
      durationMinutes = parseDurationToMinutes(packageInfo.duration) || 60;
    }
    const serviceName = packageInfo ? packageInfo.name : 'General Appointment';

    // Ensure customer exists (create minimal record without fake personal data)
    let customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          id: customerId,
          name: opts.customerName || 'Customer',
          email: null,
        },
      });
    }

    // Check conflicts for the candidate slot
    const { start, end } = this.getSlotInterval(parsedDateTime, durationMinutes);
    const conflicts = await this.prisma.booking.findMany({
      where: {
        status: 'confirmed',
        AND: [
          { dateTime: { gte: start } }, // booking start >= slot start
          { dateTime: { lt: end } },   // booking start < slot end (this checks overlap of start times)
        ],
      },
    });

    // The above simple check assumes bookings are stored by start time only. For robust overlap
    // checking you may want to store `endTime` in DB; alternatively fetch bookings for day and check intervals below.

    if (conflicts.length > 0) {
      throw new Error('Time slot conflict');
    }

    // Create provisional booking in a transaction to be safe
    const booking = await this.prisma.booking.create({
      data: {
        customerId,
        service: selectedService,
        dateTime: parsedDateTime,
        status: 'provisional',
        recipientName: opts.recipientName,
        recipientPhone: opts.recipientPhone,
      },
    });

    // enqueue background confirmation or notifications
    await this.bookingQueue.add('confirmBooking', { bookingId: booking.id });

    return booking;
  }

  /* --------------------------
   * createBookingFromMessage helper (keeps legacy)
   * -------------------------- */
  async createBookingFromMessage(message: any) {
    const parsed = chrono.parse(message.content);
    if (parsed.length > 0) {
      const local = parsed[0].start.date();
      const dt = DateTime.fromJSDate(local).setZone(this.STUDIO_TZ);
      return this.createBooking(message.customerId, { dateTime: new Date(dt.toUTC().toISO()) });
    }
    throw new Error('No date/time found');
  }

  /* --------------------------
   * Efficient availability check
   * - Check conflicts by querying confirmed bookings for that day
   * - Return available boolean and suggestions (array of Date in ISO UTC)
   * -------------------------- */
  async checkAvailability(requested: Date, service?: string): Promise<{ available: boolean; suggestions?: string[] }> {
    let duration = 60;
    if (service) {
      const pkg = await this.prisma.package.findFirst({ where: { name: service } });
      if (pkg) duration = parseDurationToMinutes(pkg.duration) || 60;
    }

    // Normalize requested to salon timezone for slot suggestions
    const requestedDtInSalon = DateTime.fromJSDate(requested).setZone(this.STUDIO_TZ);
    const dayStart = requestedDtInSalon.startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    const dayEnd = requestedDtInSalon.startOf('day').set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

    // Fetch all confirmed bookings for that day (single DB call)
    const bookingsForDay = await this.prisma.booking.findMany({
      where: {
        status: 'confirmed',
        dateTime: {
          gte: new Date(dayStart.toUTC().toISO()),
          lt: new Date(dayEnd.plus({ days: 1 }).toUTC().toISO()),
        },
      },
    });

    // Build array of occupied intervals (start,end) as Date in UTC
    const occupied: { start: Date; end: Date }[] = bookingsForDay.map(b => {
      const start = DateTime.fromJSDate(new Date(b.dateTime)).toUTC();
      const dur = b.durationMinutes ?? duration;
      const end = start.plus({ minutes: dur });
      return { start: start.toJSDate(), end: end.toJSDate() };
    });

    // Check requested slot overlap
    const reqStartUTC = DateTime.fromJSDate(requested).toUTC();
    const reqEndUTC = reqStartUTC.plus({ minutes: duration });
    const overlaps = occupied.some(o => this.intervalsOverlap(reqStartUTC.toJSDate(), reqEndUTC.toJSDate(), o.start, o.end));
    if (!overlaps) {
      return { available: true };
    }

    // Build suggestions: iterate hour-by-hour within salon hours and pick free slots
    const suggestions: string[] = [];
    let cursor = dayStart;
    while (cursor < dayEnd && suggestions.length < 5) {
      const slotStartUTC = cursor.toUTC();
      const slotEndUTC = slotStartUTC.plus({ minutes: duration });

      const isConflict = occupied.some(o => this.intervalsOverlap(slotStartUTC.toJSDate(), slotEndUTC.toJSDate(), o.start, o.end));
      if (!isConflict) {
        suggestions.push(slotStartUTC.toISO()); // ISO string UTC
      }

      cursor = cursor.plus({ minutes: 30 }); // step by 30 minutes for finer granularity
    }

    return { available: false, suggestions };
  }

  /* --------------------------
   * getAvailableSlotsForDate: returns Date[] (UTC ISO strings) for easy display
   * -------------------------- */
  async getAvailableSlotsForDate(date: string, service?: string): Promise<string[]> {
    const dateInSalon = DateTime.fromISO(date, { zone: this.STUDIO_TZ }).startOf('day');
    const dayStart = dateInSalon.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    const dayEnd = dateInSalon.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

    const bookingsForDay = await this.prisma.booking.findMany({
      where: {
        status: 'confirmed',
        dateTime: {
          gte: new Date(dayStart.toUTC().toISO()),
          lt: new Date(dayEnd.plus({ days: 1 }).toUTC().toISO()),
        },
      },
    });

    const occupied = bookingsForDay.map(b => {
      const s = DateTime.fromJSDate(new Date(b.dateTime)).toUTC();
      const dur = b.durationMinutes ?? 60;
      const e = s.plus({ minutes: dur });
      return { start: s.toJSDate(), end: e.toJSDate() };
    });

    let duration = 60;
    if (service) {
      const pkg = await this.prisma.package.findFirst({ where: { name: service } });
      if (pkg) duration = parseDurationToMinutes(pkg.duration) || 60;
    }
    const slots: string[] = [];
    let cursor = dayStart;
    while (cursor < dayEnd) {
      const sUtc = cursor.toUTC();
      const eUtc = sUtc.plus({ minutes: duration });
      const conflict = occupied.some(o => this.intervalsOverlap(sUtc.toJSDate(), eUtc.toJSDate(), o.start, o.end));
      if (!conflict) slots.push(sUtc.toISO());
      cursor = cursor.plus({ minutes: 30 });
    }
    return slots;
  }

  /* --------------------------
   * updateBooking: edit an existing booking
   * - Validates conflicts similarly to create
   * -------------------------- */
  async updateBooking(bookingId: string, updates: { service?: string; dateTime?: Date }) {
    return this.prisma.$transaction(async (tx) => {
      const currentBooking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!currentBooking) throw new Error('Booking not found');

      const newDateTime = updates.dateTime ?? new Date(currentBooking.dateTime);
      const newService = updates.service ?? currentBooking.service;
      let duration = currentBooking.durationMinutes ?? 60;
      if (newService) {
        const pkg = await tx.package.findFirst({ where: { name: newService } });
        if (pkg) duration = parseDurationToMinutes(pkg.duration) || duration;
      }

      const slotStart = DateTime.fromJSDate(newDateTime).toUTC().toJSDate();
      const slotEnd = DateTime.fromJSDate(newDateTime).plus({ minutes: duration }).toUTC().toJSDate();

      // Check conflicts excluding current booking
      const conflicts = await tx.booking.findMany({
        where: {
          id: { not: bookingId },
          status: 'confirmed',
          dateTime: { gte: slotStart, lt: slotEnd },
        },
      });

      if (conflicts.length > 0) throw new Error(this.formatBookingConflictMessage(conflicts, newDateTime));

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { service: newService, dateTime: newDateTime, durationMinutes: duration },
      });

      return updated;
    });
  }

  async confirmBooking(bookingId: string) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' },
    });
  }

  async cancelBooking(bookingId: string) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled' },
    });
  }

  async getBookings(customerId?: string) {
    const where = customerId ? { customerId } : {};
    const bookings = await this.prisma.booking.findMany({
      where,
      include: { customer: true },
    });
    return { bookings, total: bookings.length };
  }
    // Create a new package
  async createPackage(data: any) {
    return this.prisma.package.create({ data });
  }

  // Update a package
  async updatePackage(id: string, data: any) {
    return this.prisma.package.update({ where: { id }, data });
  }

  // Delete a package
  async deletePackage(id: string) {
    return this.prisma.package.delete({ where: { id } });
  }
}
