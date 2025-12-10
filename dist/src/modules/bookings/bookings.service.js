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
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const event_emitter_1 = require("@nestjs/event-emitter");
const prisma_service_1 = require("../../prisma/prisma.service");
const payments_service_1 = require("../payments/payments.service");
const messages_service_1 = require("../messages/messages.service");
const calendar_service_1 = require("../calendar/calendar.service");
const notifications_service_1 = require("../notifications/notifications.service");
const packages_service_1 = require("../packages/packages.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const chrono = require("chrono-node");
const luxon_1 = require("luxon");
let BookingsService = BookingsService_1 = class BookingsService {
    async isAwaitingRescheduleTime(bookingId) {
        return false;
    }
    async getActiveBookings(customerId) {
        return this.prisma.booking.findMany({ where: { customerId, status: 'confirmed' } });
    }
    async setAwaitingRescheduleSelection(customerId, awaiting) {
        return Promise.resolve();
    }
    async setAwaitingRescheduleTime(bookingId, awaiting) {
        return Promise.resolve();
    }
    async checkTimeConflict(dateTime) {
        return false;
    }
    async updateBookingTime(bookingId, dateTime) {
        return this.updateBooking(bookingId, { dateTime });
    }
    async getPackages(type) {
        return this.packagesService.getPackages(type);
    }
    async completeBookingDraft(customerId, providedDateTime) {
        this.logger.debug(`completeBookingDraft called for customerId=${customerId}`);
        try {
            const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
            this.logger.debug(`Fetched bookingDraft: ${JSON.stringify(draft)}`);
            if (!draft)
                throw new Error(`No booking draft found for customerId=${customerId}`);
            if (!draft.service)
                throw new Error(`Draft missing service for customerId=${customerId}`);
            if (!draft.dateTimeIso && !providedDateTime)
                throw new Error(`Draft missing dateTimeIso for customerId=${customerId}`);
            if (!draft.name)
                throw new Error(`Draft missing name for customerId=${customerId}`);
            let recipientPhone = draft.recipientPhone;
            if (!recipientPhone) {
                const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
                if (customer?.phone) {
                    recipientPhone = customer.phone;
                }
                else {
                    throw new Error(`Draft missing recipientPhone for customerId=${customerId} and no customer phone found`);
                }
            }
            const serviceName = draft.service ? draft.service.trim() : '';
            const pkg = await this.packagesService.findPackageByName(serviceName);
            if (!pkg || pkg.deposit == null) {
                throw new Error(`Package deposit not configured for ${serviceName}`);
            }
            const depositAmount = pkg.deposit;
            let phone = recipientPhone;
            if (!phone.startsWith('254')) {
                phone = `254${phone.replace(/^0+/, '')}`;
            }
            this.logger.debug(`[STK] Using phone: ${phone}, amount: ${depositAmount}`);
            this.eventEmitter.emit('booking.draft.completed', {
                customerId,
                draftId: draft.id,
                service: draft.service,
                dateTime: providedDateTime || new Date(draft.dateTimeIso),
                recipientPhone,
                depositAmount,
            });
            return {
                message: "I've sent a request to your phone for the deposit. 📲 Once you complete that, your magical session will be officially booked! ✨",
                depositAmount,
                packageName: pkg.name,
                checkoutRequestId: 'simulated_checkout_id',
                paymentId: 'simulated_payment_id'
            };
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
    constructor(prisma, bookingQueue, paymentsService, messagesService, calendarService, notificationsService, packagesService, eventEmitter, whatsappService) {
        this.prisma = prisma;
        this.bookingQueue = bookingQueue;
        this.paymentsService = paymentsService;
        this.messagesService = messagesService;
        this.calendarService = calendarService;
        this.notificationsService = notificationsService;
        this.packagesService = packagesService;
        this.eventEmitter = eventEmitter;
        this.whatsappService = whatsappService;
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
        return this.prisma.bookingDraft.findUnique({
            where: { customerId }
        });
    }
    async getLatestPaymentForDraft(customerId) {
        const draft = await this.getBookingDraft(customerId);
        if (draft) {
            return this.prisma.payment.findFirst({
                where: { bookingDraftId: draft.id },
                orderBy: { createdAt: 'desc' },
                include: { bookingDraft: true },
            });
        }
        return this.prisma.payment.findFirst({
            where: {
                bookingDraft: {
                    customerId: customerId,
                },
            },
            orderBy: { createdAt: 'desc' },
            include: { bookingDraft: true },
        });
    }
    async checkReceiptVerificationRateLimit(customerId) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentPayments = await this.prisma.payment.findMany({
            where: {
                bookingDraft: { customerId },
                createdAt: { gte: fiveMinutesAgo },
            },
            orderBy: { createdAt: 'desc' },
        });
        const maxAttempts = 5;
        if (recentPayments.length >= maxAttempts) {
            const oldestAttempt = recentPayments[recentPayments.length - 1];
            const resetTime = new Date(oldestAttempt.createdAt.getTime() + 5 * 60 * 1000);
            return { allowed: false, attempts: recentPayments.length, resetTime };
        }
        return { allowed: true, attempts: recentPayments.length };
    }
    async hasRecentPaymentPrompt(customerId) {
        const payment = await this.getLatestPaymentForDraft(customerId);
        if (!payment)
            return false;
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        return payment.createdAt > fiveMinutesAgo && payment.status === 'pending';
    }
    async verifyPaymentByReceipt(customerId, receiptNumber) {
        const draft = await this.getBookingDraft(customerId);
        if (!draft) {
            return { success: false, message: "I don't see a pending booking. Would you like to start a new booking?" };
        }
        const rateLimit = await this.checkReceiptVerificationRateLimit(customerId);
        if (!rateLimit.allowed) {
            this.logger.warn(`[SECURITY] Rate limit exceeded for customer ${customerId}. Attempts: ${rateLimit.attempts}`);
            const resetMinutes = Math.ceil((rateLimit.resetTime.getTime() - Date.now()) / 1000 / 60);
            return {
                success: false,
                message: `Too many verification attempts. Please wait ${resetMinutes} minute${resetMinutes > 1 ? 's' : ''} before trying again. If you're having issues, contact us at 0720 111928. 💖`,
            };
        }
        const normalizedReceipt = receiptNumber.trim().toUpperCase();
        if (!/^[A-Z0-9]{10}$/.test(normalizedReceipt)) {
            this.logger.warn(`[SECURITY] Invalid receipt format provided by customer ${customerId}: ${receiptNumber}`);
            return {
                success: false,
                message: `The receipt number "${receiptNumber}" doesn't look like a valid M-PESA receipt. M-PESA receipts are 10 characters (letters and numbers). Could you please double-check and share it again? 📲`,
            };
        }
        const existingReceiptPayment = await this.prisma.payment.findFirst({
            where: {
                mpesaReceipt: normalizedReceipt,
                status: 'success',
                NOT: { bookingDraftId: draft.id },
            },
        });
        if (existingReceiptPayment) {
            this.logger.warn(`[SECURITY] Receipt ${normalizedReceipt} already used for another payment ${existingReceiptPayment.id} by customer ${customerId}`);
            return {
                success: false,
                message: `This receipt number has already been used for another booking. Each payment receipt can only be used once. Please use the receipt from your current payment, or I can send you a fresh payment prompt. Just say "resend". 📲`,
            };
        }
        const existingPayment = await this.prisma.payment.findFirst({
            where: {
                bookingDraftId: draft.id,
                mpesaReceipt: normalizedReceipt,
                status: 'success',
            },
        });
        if (existingPayment) {
            return {
                success: true,
                message: `✅ Payment verified! Receipt ${normalizedReceipt} confirmed. Your booking is already confirmed! 💖`,
                payment: existingPayment,
            };
        }
        const pendingPayment = await this.prisma.payment.findFirst({
            where: {
                bookingDraftId: draft.id,
                status: 'pending',
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!pendingPayment) {
            return {
                success: false,
                message: `I don't see any pending payment for this booking. Please wait for the payment prompt, or I can send you a fresh one. Just say "resend". 📲`,
            };
        }
        const paymentAge = Date.now() - new Date(pendingPayment.createdAt).getTime();
        const maxAge = 24 * 60 * 60 * 1000;
        if (paymentAge > maxAge) {
            this.logger.warn(`[SECURITY] Attempt to verify receipt for old payment (${Math.floor(paymentAge / 1000 / 60)} minutes old) by customer ${customerId}`);
            return {
                success: false,
                message: `This payment request is too old. Please start a new booking and I'll send you a fresh payment prompt. 💖`,
            };
        }
        try {
            const verification = await this.paymentsService.verifyReceiptWithMpesaAPI(pendingPayment.id, normalizedReceipt);
            if (!verification.valid) {
                this.logger.warn(`[SECURITY] Receipt verification failed for payment ${pendingPayment.id}: ${verification.error}`);
                return {
                    success: false,
                    message: `I couldn't verify the receipt "${normalizedReceipt}" with M-PESA. Please double-check the receipt number and try again. If the issue persists, I can send you a fresh payment prompt. Just say "resend". 📲`,
                };
            }
            if (!verification.matches) {
                this.logger.warn(`[SECURITY] Receipt mismatch for payment ${pendingPayment.id}. Provided: ${normalizedReceipt}`);
                return {
                    success: false,
                    message: `The receipt number "${normalizedReceipt}" doesn't match our records. Please double-check the receipt number from your M-PESA message. If you're sure it's correct, contact us at 0720 111928 for assistance. 📲`,
                };
            }
            await this.prisma.payment.update({
                where: { id: pendingPayment.id },
                data: {
                    status: 'success',
                    mpesaReceipt: normalizedReceipt,
                },
            });
            if (draft.dateTimeIso) {
                const dateObj = new Date(draft.dateTimeIso);
                await this.completeBookingDraft(customerId, dateObj);
            }
            else if (draft.date && draft.time) {
                const dateStr = draft.date;
                const timeStr = draft.time;
                const combined = `${dateStr}T${timeStr}:00`;
                try {
                    const dateObj = new Date(combined);
                    if (!isNaN(dateObj.getTime())) {
                        await this.completeBookingDraft(customerId, dateObj);
                    }
                }
                catch (error) {
                    this.logger.error('Error parsing date/time for receipt verification:', error);
                }
            }
            this.logger.log(`[SECURITY] Receipt ${normalizedReceipt} successfully verified for payment ${pendingPayment.id}`);
            return {
                success: true,
                message: `✅ Payment verified! Receipt ${normalizedReceipt} confirmed through M-PESA. Your booking is now confirmed! You'll receive a confirmation message shortly. 🎉`,
                payment: pendingPayment,
            };
        }
        catch (error) {
            this.logger.error(`[SECURITY] Error during receipt verification for payment ${pendingPayment.id}:`, error);
            return {
                success: false,
                message: `I encountered an issue verifying your receipt. Please try again, or contact us at 0720 111928 for assistance. 💖`,
            };
        }
    }
    async resendPaymentPrompt(customerId, newPhone) {
        let draft = await this.getBookingDraft(customerId);
        if (!draft) {
            const latestPayment = await this.getLatestPaymentForDraft(customerId);
            if (latestPayment?.bookingDraft) {
                draft = latestPayment.bookingDraft;
            }
        }
        if (!draft) {
            return { success: false, message: "I don't see a pending booking. Would you like to start a new booking? 💖" };
        }
        if (draft.step !== 'confirm') {
            return { success: false, message: "Your booking isn't ready for payment yet. Let's complete the booking details first! 📋" };
        }
        const phone = newPhone || draft.recipientPhone;
        if (!phone) {
            return { success: false, message: "I need your phone number to send the payment prompt. Could you please provide it? 📱" };
        }
        const amount = await this.getDepositForDraft(customerId) || 2000;
        try {
            await this.prisma.payment.deleteMany({
                where: {
                    bookingDraftId: draft.id,
                    status: 'pending'
                }
            });
            if (newPhone && newPhone !== draft.recipientPhone) {
                await this.prisma.bookingDraft.update({
                    where: { id: draft.id },
                    data: { recipientPhone: newPhone }
                });
            }
            const result = await this.paymentsService.initiateSTKPush(draft.id, phone, amount);
            return {
                success: true,
                message: `✅ Payment prompt sent! Please check your phone (${phone}) and enter your M-PESA PIN. The prompt should arrive within 10 seconds. 📲💳`
            };
        }
        catch (error) {
            this.logger.error('Failed to resend payment prompt:', error);
            return {
                success: false,
                message: `Sorry, I encountered an issue sending the payment prompt. Please try again in a moment or contact us at 0720 111928. 💖`
            };
        }
    }
    async getDepositForDraft(customerId) {
        const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        if (!draft || !draft.service)
            return null;
        const pkg = await this.packagesService.findPackageByName(draft.service);
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
        const { packageId, ...rest } = updates;
        let customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            customer = await this.prisma.customer.create({
                data: {
                    id: customerId,
                    name: updates.name || 'Customer',
                },
            });
        }
        return this.prisma.bookingDraft.upsert({
            where: { customerId },
            update: { ...rest, updatedAt: new Date() },
            create: { customerId, step: 'service', ...rest },
        });
    }
    async deleteBookingDraft(customerId) {
        return this.prisma.bookingDraft.deleteMany({ where: { customerId } });
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
        const selectedService = opts.service ? opts.service.trim() : '';
        let packageInfo = null;
        let durationMinutes = 60;
        if (selectedService) {
            packageInfo = await this.packagesService.findPackageByName(selectedService);
            if (!packageInfo) {
                const allPackages = await this.prisma.package.findMany();
                throw new Error(`Service "${selectedService}" not found. Available packages: ${allPackages.map(p => p.name).join(', ')}`);
            }
            durationMinutes = BookingsService_1.parseDurationToMinutes(packageInfo.duration) || 60;
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
            const pkg = await this.packagesService.findPackageByName(service);
            if (pkg)
                duration = BookingsService_1.parseDurationToMinutes(pkg.duration) || 60;
        }
        const requestedDtInMaternity = luxon_1.DateTime.fromJSDate(requested).setZone(this.STUDIO_TZ);
        const dayStart = requestedDtInMaternity.startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
        const dayEnd = requestedDtInMaternity.startOf('day').set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
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
        const allSlots = [];
        let cursor = dayStart;
        while (cursor < dayEnd) {
            const slotStartUTC = cursor.toUTC();
            const slotEndUTC = slotStartUTC.plus({ minutes: duration });
            const isConflict = occupied.some(o => this.intervalsOverlap(slotStartUTC.toJSDate(), slotEndUTC.toJSDate(), o.start, o.end));
            if (!isConflict) {
                const distance = Math.abs(cursor.diff(requestedDtInMaternity, 'minutes').minutes);
                allSlots.push({ time: cursor, distance });
            }
            cursor = cursor.plus({ minutes: 30 });
        }
        allSlots.sort((a, b) => a.distance - b.distance);
        suggestions.push(...allSlots.slice(0, 10).map(s => s.time.toUTC().toISO()));
        const sameDayFull = suggestions.length === 0;
        return { available: false, suggestions, sameDayFull };
    }
    async findAvailableSlotsAcrossDays(requestedDate, service, daysToCheck = 7) {
        let duration = 60;
        if (service) {
            const pkg = await this.packagesService.findPackageByName(service);
            if (pkg)
                duration = BookingsService_1.parseDurationToMinutes(pkg.duration) || 60;
        }
        const requestedDt = luxon_1.DateTime.fromJSDate(requestedDate).setZone(this.STUDIO_TZ);
        const results = [];
        for (let dayOffset = 0; dayOffset <= daysToCheck; dayOffset++) {
            const checkDate = requestedDt.plus({ days: dayOffset });
            const dateStr = checkDate.toFormat('yyyy-MM-dd');
            const dayOfWeek = checkDate.weekday;
            const slots = await this.getAvailableSlotsForDate(dateStr, service);
            if (slots.length > 0) {
                results.push({
                    date: dateStr,
                    slots: slots.slice(0, 5),
                });
                if (results.length >= 3)
                    break;
            }
        }
        return results;
    }
    async getAvailableSlotsForDate(date, service) {
        const dateInMaternity = luxon_1.DateTime.fromISO(date, { zone: this.STUDIO_TZ }).startOf('day');
        const dayStart = dateInMaternity.set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
        const dayEnd = dateInMaternity.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
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
            const pkg = await this.packagesService.findPackageByName(service);
            if (pkg)
                duration = BookingsService_1.parseDurationToMinutes(pkg.duration) || 60;
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
            const now = new Date();
            const bookingTime = new Date(currentBooking.dateTime);
            const diffMs = bookingTime.getTime() - now.getTime();
            const hoursUntilBooking = diffMs / (1000 * 60 * 60);
            if (hoursUntilBooking < 72 && hoursUntilBooking > 0) {
                throw new Error('Changes cannot be made within 72 hours of the appointment. Please contact support directly.');
            }
            const newDateTime = updates.dateTime ?? new Date(currentBooking.dateTime);
            const newService = updates.service ?? currentBooking.service;
            let duration = currentBooking.durationMinutes ?? 60;
            if (newService) {
                const cleanName = newService.trim();
                let pkg = await tx.package.findFirst({ where: { name: { equals: cleanName, mode: 'insensitive' } } });
                if (!pkg)
                    pkg = await tx.package.findFirst({ where: { name: { equals: `${cleanName} Package`, mode: 'insensitive' } } });
                if (!pkg)
                    pkg = await tx.package.findFirst({ where: { name: { contains: cleanName, mode: 'insensitive' } } });
                if (pkg)
                    duration = BookingsService_1.parseDurationToMinutes(pkg.duration) || duration;
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
                include: { customer: true }
            });
            if (updated.googleEventId) {
                try {
                    await this.calendarService.updateEvent(updated.googleEventId, updated);
                }
                catch (error) {
                    this.logger.error(`Failed to update Google Calendar event for booking ${bookingId}`, error);
                }
            }
            const msg = `Your appointment has been rescheduled to ${luxon_1.DateTime.fromJSDate(newDateTime).setZone(this.STUDIO_TZ).toFormat('ccc, LLL dd, yyyy HH:mm')}.`;
            try {
                if (updated.customer?.whatsappId) {
                    await this.whatsappService.sendMessage(updated.customer.whatsappId, msg);
                }
                else {
                    this.logger.warn(`No WhatsApp ID for customer ${updated.customerId}, reschedule msg not sent via WA API`);
                }
            }
            catch (e) {
                this.logger.error(`Failed to send reschedule notification to ${updated.customerId}`, e);
            }
            return updated;
        });
    }
    async confirmBooking(bookingId) {
        const booking = await this.prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'confirmed' },
            include: { customer: true }
        });
        try {
            const eventId = await this.calendarService.createEvent(booking);
            await this.prisma.booking.update({
                where: { id: bookingId },
                data: { googleEventId: eventId },
            });
        }
        catch (error) {
            this.logger.error(`Failed to create Google Calendar event for booking ${bookingId}`, error);
        }
        return booking;
    }
    async cancelBooking(bookingId) {
        const currentBooking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!currentBooking)
            throw new Error('Booking not found');
        const now = new Date();
        const bookingTime = new Date(currentBooking.dateTime);
        const diffMs = bookingTime.getTime() - now.getTime();
        const hoursUntilBooking = diffMs / (1000 * 60 * 60);
        if (hoursUntilBooking < 72 && hoursUntilBooking > 0) {
            throw new Error('Cancellations cannot be made within 72 hours of the appointment. Please contact support directly.');
        }
        const booking = await this.prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'cancelled' },
            include: { customer: true }
        });
        if (booking.googleEventId) {
            try {
                await this.calendarService.deleteEvent(booking.googleEventId);
            }
            catch (error) {
                this.logger.error(`Failed to delete Google Calendar event for booking ${bookingId}`, error);
            }
        }
        const msg = `Your appointment has been cancelled. We hope to see you again soon!`;
        try {
            if (booking.customer?.whatsappId) {
                await this.whatsappService.sendMessage(booking.customer.whatsappId, msg);
            }
        }
        catch (e) {
            this.logger.error(`Failed to send cancellation notification to ${booking.customerId}`, e);
        }
        return booking;
    }
    async getBookings(customerId) {
        const where = customerId ? { customerId } : {};
        const bookings = await this.prisma.booking.findMany({
            where,
            include: { customer: true },
        });
        return { bookings, total: bookings.length };
    }
    async getBookingById(id) {
        return this.prisma.booking.findUnique({
            where: { id },
            include: {
                customer: true,
                invoice: true,
                payments: true,
                reminders: true,
                followups: true,
            },
        });
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
    async getLatestConfirmedBooking(customerId) {
        return this.prisma.booking.findFirst({
            where: {
                customerId,
                status: 'confirmed',
            },
            orderBy: { dateTime: 'desc' },
            include: { customer: true },
        });
    }
    async formatBookingConfirmationMessage(booking, mpesaReceipt, reminderTimes = []) {
        const packageInfo = await this.packagesService.findPackageByName(booking.service);
        if (!packageInfo) {
            return "Payment successful! Your maternity photoshoot booking is now confirmed. We'll send you a reminder closer to the date. 💖";
        }
        const bookingDateTime = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
        const formattedDate = bookingDateTime.toFormat('MMMM d, yyyy');
        const formattedTime = bookingDateTime.toFormat('h:mm a');
        const features = [];
        if (packageInfo.images)
            features.push(`• ${packageInfo.images} soft copy images`);
        if (packageInfo.makeup)
            features.push(`• Professional makeup`);
        if (packageInfo.outfits)
            features.push(`• ${packageInfo.outfits} outfit change${packageInfo.outfits > 1 ? 's' : ''}`);
        if (packageInfo.styling)
            features.push(`• Professional styling`);
        if (packageInfo.wig)
            features.push(`• Styled wig`);
        if (packageInfo.balloonBackdrop)
            features.push(`• Customized balloon backdrop`);
        if (packageInfo.photobook) {
            const size = packageInfo.photobookSize ? ` (${packageInfo.photobookSize})` : '';
            features.push(`• Photobook${size}`);
        }
        if (packageInfo.mount)
            features.push(`• A3 mount`);
        const featuresText = features.length > 0 ? features.join('\n') : '• Custom package features';
        let remindersText = '';
        if (reminderTimes.length > 0) {
            const reminderLines = reminderTimes.map(({ days, dateTime }) => {
                const reminderDate = dateTime.setZone('Africa/Nairobi');
                return `• ${reminderDate.toFormat('MMMM d, yyyy')} at ${reminderDate.toFormat('h:mm a')} (${days} day${days > 1 ? 's' : ''} before)`;
            });
            remindersText = `\n\n⏰ *Reminders Scheduled:*\n${reminderLines.join('\n')}`;
        }
        const cleanName = (name) => {
            if (!name)
                return 'Guest';
            const cleaned = name.replace(/^WhatsApp User\s+/i, '').trim();
            return cleaned || 'Guest';
        };
        const displayName = booking.recipientName
            ? cleanName(booking.recipientName)
            : cleanName(booking.customer?.name);
        const message = `✅ *Booking Confirmed!* ✨

📦 *Package:* ${packageInfo.name} (${packageInfo.type === 'outdoor' ? 'Outdoor' : 'Studio'})
⏱️ *Duration:* ${packageInfo.duration}
💰 *Price:* ${packageInfo.price.toLocaleString()} KSH (Deposit: ${packageInfo.deposit.toLocaleString()} KSH paid)

📅 *Your Session:*
Date: ${formattedDate}
Time: ${formattedTime} (EAT)

👤 *Recipient:* ${displayName}
📱 *Contact:* ${booking.recipientPhone || booking.customer?.phone}

🎁 *Package Includes:*
${featuresText}

💳 *Payment Receipt:* ${mpesaReceipt}${remindersText}

🔸 *Important Policies:*
• Remaining balance is due after the shoot.
• Edited photos are delivered in 10 working days.
• Reschedules/Cancellations must be made at least 72 hours before the shoot to avoid forfeiting the fee.

We can't wait to capture your beautiful memories! 💖`;
        return message;
    }
    async countBookingsForCustomer(query) {
        let customerWhere = {};
        if (query.id)
            customerWhere.id = query.id;
        if (query.whatsappId)
            customerWhere.whatsappId = query.whatsappId;
        if (query.phone)
            customerWhere.phone = query.phone;
        const customer = await this.prisma.customer.findFirst({ where: customerWhere });
        if (!customer)
            return 0;
        return this.prisma.booking.count({ where: { customerId: customer.id } });
    }
    async getBookingSummariesForCustomer(query) {
        let customerWhere = {};
        if (query.id)
            customerWhere.id = query.id;
        if (query.whatsappId)
            customerWhere.whatsappId = query.whatsappId;
        if (query.phone)
            customerWhere.phone = query.phone;
        const customer = await this.prisma.customer.findFirst({ where: customerWhere });
        if (!customer)
            return [];
        const bookings = await this.prisma.booking.findMany({
            where: { customerId: customer.id },
            orderBy: { dateTime: 'desc' },
            take: 10,
        });
        return bookings.map(b => ({
            date: b.dateTime instanceof Date ? b.dateTime.toISOString().slice(0, 10) : String(b.dateTime).slice(0, 10),
            service: b.service,
            status: b.status,
        }));
    }
    static parseDurationToMinutes(duration) {
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
    async advanceBookingStep(customerId, nextStep) {
        return this.prisma.bookingDraft.update({
            where: { customerId },
            data: { step: nextStep },
        });
    }
    async getBookingStep(customerId) {
        const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        return draft?.step || 'collect_service';
    }
    async editBookingDraft(customerId, field, value) {
        return this.prisma.bookingDraft.update({
            where: { customerId },
            data: { [field]: value },
        });
    }
    async reviewBookingDraft(customerId) {
        return this.prisma.bookingDraft.findUnique({ where: { customerId } });
    }
    async confirmBookingDraft(customerId) {
        return this.advanceBookingStep(customerId, 'confirm_deposit');
    }
    async cancelBookingDraft(customerId) {
        await this.prisma.bookingDraft.deleteMany({ where: { customerId } });
        return true;
    }
    async handleEditCommand(customerId, command, value) {
        const editMap = {
            'date': 'date',
            'time': 'time',
            'package': 'service',
            'service': 'service',
            'name': 'name',
            'phone': 'recipientPhone',
        };
        const lower = command.toLowerCase();
        for (const key in editMap) {
            if (lower.includes(key)) {
                await this.editBookingDraft(customerId, editMap[key], value);
                if (editMap[key] === 'recipientPhone') {
                    const draft = await this.reviewBookingDraft(customerId);
                    if (draft && draft.service && (draft.dateTimeIso || draft.date) && draft.name && draft.recipientPhone) {
                        await this.completeBookingDraft(customerId);
                    }
                }
                return editMap[key];
            }
        }
        return null;
    }
    async getBookingSummary(customerId) {
        const draft = await this.reviewBookingDraft(customerId);
        if (!draft)
            return 'No booking draft found.';
        return `Please review your booking details:\nPackage: ${draft.service}\nDate: ${draft.date}\nTime: ${draft.time}\nName: ${draft.name}\nPhone: ${draft.recipientPhone}\nReply 'edit [field]' to change any detail, or 'confirm' to proceed.`;
    }
};
exports.BookingsService = BookingsService;
exports.BookingsService = BookingsService = BookingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('bookingQueue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, payments_service_1.PaymentsService,
        messages_service_1.MessagesService,
        calendar_service_1.CalendarService,
        notifications_service_1.NotificationsService,
        packages_service_1.PackagesService,
        event_emitter_1.EventEmitter2,
        whatsapp_service_1.WhatsappService])
], BookingsService);
//# sourceMappingURL=bookings.service.js.map