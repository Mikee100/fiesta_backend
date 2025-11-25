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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BookingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsService = void 0;
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
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../prisma/prisma.service");
const payments_service_1 = require("../payments/payments.service");
const messages_service_1 = require("../messages/messages.service");
const chrono = require("chrono-node");
const luxon_1 = require("luxon");
let BookingsService = BookingsService_1 = class BookingsService {
    async getPackages(type) {
        const where = type ? { type } : {};
        return this.prisma.package.findMany({ where });
    }
    async completeBookingDraft(customerId, providedDateTime) {
        this.logger.debug(`completeBookingDraft called for customerId=${customerId}`);
        try {
            const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
            this.logger.debug(`Fetched bookingDraft: ${JSON.stringify(draft)}`);
            if (!draft || !draft.service || (!draft.dateTimeIso && !providedDateTime) || !draft.name) {
                const msg = `Incomplete booking draft detected for customerId=${customerId}`;
                this.logger.warn(msg);
                throw new Error(msg);
            }
            const pkg = await this.prisma.package.findFirst({ where: { name: draft.service } });
            if (!pkg || !pkg.deposit) {
                throw new Error(`Package deposit not configured for ${draft.service}`);
            }
            const depositAmount = pkg.deposit;
            const phone = draft.recipientPhone;
            if (!phone) {
                throw new Error(`Recipient phone not found in draft for customerId=${customerId}`);
            }
            await this.paymentsService.initiateSTKPush(draft.id, phone, depositAmount);
            const depositMsg = `To confirm your booking, please pay the deposit of KSH ${depositAmount}. An M-Pesa prompt has been sent to your phone. Complete the payment to secure your slot!`;
            this.logger.log(`[DepositPrompt] Attempting to send WhatsApp deposit prompt to customerId=${customerId}`);
            try {
                await this.messagesService.sendOutboundMessage(customerId, depositMsg, 'whatsapp');
                this.logger.log(`[DepositPrompt] WhatsApp deposit prompt sent to customerId=${customerId}`);
            }
            catch (err) {
                this.logger.error(`[DepositPrompt] Failed to send WhatsApp deposit prompt to customerId=${customerId}`, err);
            }
            this.logger.log(`M-Pesa STK Push initiated for deposit of ${depositAmount} KSH for booking draft ${draft.id}`);
            return { message: 'Deposit payment initiated. Please complete payment on your phone to confirm booking.' };
        }
        catch (error) {
            this.logger.error(`completeBookingDraft failed for customerId=${customerId}`, error);
            throw error;
        }
    }
    async getPackageById(id) {
        return this.prisma.package.findUnique({ where: { id } });
    }
    async getStudioInfo() {
        return this.prisma.studioInfo.findFirst();
    }
    constructor(prisma, bookingQueue, paymentsService, messagesService) {
        this.prisma = prisma;
        this.bookingQueue = bookingQueue;
        this.paymentsService = paymentsService;
        this.messagesService = messagesService;
        this.logger = new common_1.Logger(BookingsService_1.name);
        this.STUDIO_TZ = 'Africa/Nairobi';
    }
    getSlotInterval(dateTime, durationMinutes) {
        const start = luxon_1.DateTime.fromJSDate(dateTime, { zone: 'utc' });
        const end = start.plus({ minutes: durationMinutes });
        return { start: start.toJSDate(), end: end.toJSDate() };
    }
    intervalsOverlap(aStart, aEnd, bStart, bEnd) {
        return aStart < bEnd && bStart < aEnd;
    }
    formatBookingConflictMessage(conflictBookings, requestedDate) {
        if (!conflictBookings.length)
            return 'The slot is available.';
        const times = conflictBookings.map(b => luxon_1.DateTime.fromJSDate(b.dateTime).setZone(this.STUDIO_TZ).toFormat('ccc, LLL dd, yyyy HH:mm'));
        return `The requested time ${luxon_1.DateTime.fromJSDate(requestedDate)
            .setZone(this.STUDIO_TZ)
            .toFormat('ccc, LLL dd, yyyy HH:mm')} is already booked. Conflicting bookings: ${times.join(', ')}`;
    }
    formatNoDateMessage(message) {
        return `We couldn't find a date or time in your message: "${message}". Please specify when you'd like your appointment.`;
    }
    formatDraftIncompleteMessage(draft) {
        return `Your booking draft is incomplete. Please ensure you've selected a service, date/time, and provided your name.`;
    }
    async getBookingDraft(customerId) {
        return this.prisma.bookingDraft.findUnique({ where: { customerId } });
    }
    async getDepositForDraft(customerId) {
        const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        if (!draft || !draft.service)
            return null;
        const pkg = await this.prisma.package.findFirst({ where: { name: draft.service } });
        return pkg?.deposit || null;
    }
    async createBookingDraft(customerId) {
        return this.prisma.bookingDraft.create({
            data: {
                customerId,
                step: 'service',
            },
        });
    }
    async updateBookingDraft(customerId, updates) {
        return this.prisma.bookingDraft.upsert({
            where: { customerId },
            update: { ...updates, updatedAt: new Date() },
            create: { customerId, step: 'service', ...updates },
        });
    }
    async deleteBookingDraft(customerId) {
        return this.prisma.bookingDraft.delete({ where: { customerId } });
    }
    async createBooking(customerId, opts) {
        let parsedDateTime = null;
        if (opts.dateTime) {
            parsedDateTime = opts.dateTime;
        }
        else if (opts.message) {
            const results = chrono.parse(opts.message);
            if (!results.length)
                throw new Error(this.formatNoDateMessage(opts.message));
            const localDt = results[0].start.date();
            const dt = luxon_1.DateTime.fromJSDate(localDt).setZone(this.STUDIO_TZ);
            parsedDateTime = new Date(dt.toUTC().toISO());
        }
        else {
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
        const { start, end } = this.getSlotInterval(parsedDateTime, durationMinutes);
        const conflicts = await this.prisma.booking.findMany({
            where: {
                status: 'confirmed',
                AND: [
                    { dateTime: { gte: start } },
                    { dateTime: { lt: end } },
                ],
            },
        });
        if (conflicts.length > 0) {
            throw new Error('Time slot conflict');
        }
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
        await this.bookingQueue.add('confirmBooking', { bookingId: booking.id });
        return booking;
    }
    async createBookingFromMessage(message) {
        const parsed = chrono.parse(message.content);
        if (parsed.length > 0) {
            const local = parsed[0].start.date();
            const dt = luxon_1.DateTime.fromJSDate(local).setZone(this.STUDIO_TZ);
            return this.createBooking(message.customerId, { dateTime: new Date(dt.toUTC().toISO()) });
        }
        throw new Error('No date/time found');
    }
    async checkAvailability(requested, service) {
        let duration = 60;
        if (service) {
            const pkg = await this.prisma.package.findFirst({ where: { name: service } });
            if (pkg)
                duration = parseDurationToMinutes(pkg.duration) || 60;
        }
        const requestedDtInSalon = luxon_1.DateTime.fromJSDate(requested).setZone(this.STUDIO_TZ);
        const dayStart = requestedDtInSalon.startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
        const dayEnd = requestedDtInSalon.startOf('day').set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
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
            const start = luxon_1.DateTime.fromJSDate(new Date(b.dateTime)).toUTC();
            const dur = b.durationMinutes ?? duration;
            const end = start.plus({ minutes: dur });
            return { start: start.toJSDate(), end: end.toJSDate() };
        });
        const reqStartUTC = luxon_1.DateTime.fromJSDate(requested).toUTC();
        const reqEndUTC = reqStartUTC.plus({ minutes: duration });
        const overlaps = occupied.some(o => this.intervalsOverlap(reqStartUTC.toJSDate(), reqEndUTC.toJSDate(), o.start, o.end));
        if (!overlaps) {
            return { available: true };
        }
        const suggestions = [];
        let cursor = dayStart;
        while (cursor < dayEnd && suggestions.length < 5) {
            const slotStartUTC = cursor.toUTC();
            const slotEndUTC = slotStartUTC.plus({ minutes: duration });
            const isConflict = occupied.some(o => this.intervalsOverlap(slotStartUTC.toJSDate(), slotEndUTC.toJSDate(), o.start, o.end));
            if (!isConflict) {
                suggestions.push(slotStartUTC.toISO());
            }
            cursor = cursor.plus({ minutes: 30 });
        }
        return { available: false, suggestions };
    }
    async getAvailableSlotsForDate(date, service) {
        const dateInSalon = luxon_1.DateTime.fromISO(date, { zone: this.STUDIO_TZ }).startOf('day');
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
            const s = luxon_1.DateTime.fromJSDate(new Date(b.dateTime)).toUTC();
            const dur = b.durationMinutes ?? 60;
            const e = s.plus({ minutes: dur });
            return { start: s.toJSDate(), end: e.toJSDate() };
        });
        let duration = 60;
        if (service) {
            const pkg = await this.prisma.package.findFirst({ where: { name: service } });
            if (pkg)
                duration = parseDurationToMinutes(pkg.duration) || 60;
        }
        const slots = [];
        let cursor = dayStart;
        while (cursor < dayEnd) {
            const sUtc = cursor.toUTC();
            const eUtc = sUtc.plus({ minutes: duration });
            const conflict = occupied.some(o => this.intervalsOverlap(sUtc.toJSDate(), eUtc.toJSDate(), o.start, o.end));
            if (!conflict)
                slots.push(sUtc.toISO());
            cursor = cursor.plus({ minutes: 30 });
        }
        return slots;
    }
    async updateBooking(bookingId, updates) {
        return this.prisma.$transaction(async (tx) => {
            const currentBooking = await tx.booking.findUnique({ where: { id: bookingId } });
            if (!currentBooking)
                throw new Error('Booking not found');
            const newDateTime = updates.dateTime ?? new Date(currentBooking.dateTime);
            const newService = updates.service ?? currentBooking.service;
            let duration = currentBooking.durationMinutes ?? 60;
            if (newService) {
                const pkg = await tx.package.findFirst({ where: { name: newService } });
                if (pkg)
                    duration = parseDurationToMinutes(pkg.duration) || duration;
            }
            const slotStart = luxon_1.DateTime.fromJSDate(newDateTime).toUTC().toJSDate();
            const slotEnd = luxon_1.DateTime.fromJSDate(newDateTime).plus({ minutes: duration }).toUTC().toJSDate();
            const conflicts = await tx.booking.findMany({
                where: {
                    id: { not: bookingId },
                    status: 'confirmed',
                    dateTime: { gte: slotStart, lt: slotEnd },
                },
            });
            if (conflicts.length > 0)
                throw new Error(this.formatBookingConflictMessage(conflicts, newDateTime));
            const updated = await tx.booking.update({
                where: { id: bookingId },
                data: { service: newService, dateTime: newDateTime, durationMinutes: duration },
            });
            return updated;
        });
    }
    async confirmBooking(bookingId) {
        return this.prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'confirmed' },
        });
    }
    async cancelBooking(bookingId) {
        return this.prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'cancelled' },
        });
    }
    async getBookings(customerId) {
        const where = customerId ? { customerId } : {};
        const bookings = await this.prisma.booking.findMany({
            where,
            include: { customer: true },
        });
        return { bookings, total: bookings.length };
    }
    async createPackage(data) {
        return this.prisma.package.create({ data });
    }
    async updatePackage(id, data) {
        return this.prisma.package.update({ where: { id }, data });
    }
    async deletePackage(id) {
        return this.prisma.package.delete({ where: { id } });
    }
};
exports.BookingsService = BookingsService;
exports.BookingsService = BookingsService = BookingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('bookingQueue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, payments_service_1.PaymentsService,
        messages_service_1.MessagesService])
], BookingsService);
//# sourceMappingURL=bookings.service.js.map