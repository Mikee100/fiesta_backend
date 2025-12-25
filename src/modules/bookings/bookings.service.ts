import { Injectable, Logger } from '@nestjs/common';
import { BookingStep } from './booking-message.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { MessagesService } from '../messages/messages.service';
import { CalendarService } from '../calendar/calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PackagesService } from '../packages/packages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { BookingCreatedEvent } from './events/booking.events';
import * as chrono from 'chrono-node';
import { DateTime, Duration } from 'luxon';

type ServiceInfo = { name: string; durationMinutes: number; price: number };

@Injectable()
export class BookingsService {
  // Checks if booking is awaiting reschedule time (stub)
  async isAwaitingRescheduleTime(bookingId: string): Promise<boolean> {
    // Implement actual logic as needed
    return false;
  }
  // Returns active bookings for a customer (stub)
  async getActiveBookings(customerId: string) {
    return this.prisma.booking.findMany({ where: { customerId, status: 'confirmed' } });
  }

  // Sets whether the customer is awaiting reschedule selection (stub)
  async setAwaitingRescheduleSelection(customerId: string, awaiting: boolean) {
    // Implement flag logic as needed
    return Promise.resolve();
  }

  // Sets whether the booking is awaiting reschedule time (stub)
  async setAwaitingRescheduleTime(bookingId: string, awaiting: boolean) {
    // Implement flag logic as needed
    return Promise.resolve();
  }

  // Checks for time conflict (stub)
  async checkTimeConflict(dateTime: Date) {
    // Implement actual conflict logic as needed
    return false;
  }

  // Updates booking time (calls updateBooking)
  async updateBookingTime(bookingId: string, dateTime: Date) {
    return this.updateBooking(bookingId, { dateTime });
  }
  private readonly logger = new Logger(BookingsService.name);
  private readonly STUDIO_TZ = 'Africa/Nairobi';


  // Fetch all packages (optionally filter by type: 'outdoor' | 'studio')
  async getPackages(type?: string) {
    return this.packagesService.getPackages(type);
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

      // Validation for required fields
      // Validation for required fields
      if (!draft) throw new Error(`No booking draft found for customerId=${customerId}`);
      if (!draft.service) throw new Error(`Draft missing service for customerId=${customerId}`);
      if (!draft.dateTimeIso && !providedDateTime) throw new Error(`Draft missing dateTimeIso for customerId=${customerId}`);
      if (!draft.name) throw new Error(`Draft missing name for customerId=${customerId}`);

      // Handle missing recipientPhone by checking customer profile
      let recipientPhone = draft.recipientPhone;
      if (!recipientPhone) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (customer?.phone) {
          recipientPhone = customer.phone;
        } else {
          throw new Error(`Draft missing recipientPhone for customerId=${customerId} and no customer phone found`);
        }
      }

      // Get package deposit amount (case-insensitive match)
      const serviceName = draft.service ? draft.service.trim() : '';
      const pkg = await this.packagesService.findPackageByName(serviceName);

      if (!pkg || pkg.deposit == null) {
        throw new Error(`Package deposit not configured for ${serviceName}`);
      }
      const depositAmount = pkg.deposit;

      // Format phone
      let phone = recipientPhone;
      if (!phone.startsWith('254')) {
        phone = `254${phone.replace(/^0+/, '')}`;
      }
      this.logger.debug(`[STK] Using phone: ${phone}, amount: ${depositAmount}`);

      // Emit event for payment initiation
      this.logger.error(`[DEBUG-TRACE] Emitting booking.draft.completed event for customerId=${customerId}, draftId=${draft.id}`);
      this.logger.log(`[BOOKING] Emitting booking.draft.completed event for customerId=${customerId}, draftId=${draft.id}`);
      this.eventEmitter.emit('booking.draft.completed', {
        customerId,
        draftId: draft.id,
        service: draft.service,
        dateTime: providedDateTime || new Date(draft.dateTimeIso),
        recipientPhone,
        depositAmount,
      });
      this.logger.log(`[BOOKING] Event emitted successfully`);

      return {
        message: "I've sent a request to your phone for the deposit. 📲 Once you complete that, your magical session will be officially booked! ✨",
        depositAmount,
        packageName: pkg.name,
        checkoutRequestId: 'simulated_checkout_id', // In a real app this comes from the payment provider
        paymentId: 'simulated_payment_id' // In a real app this comes from the payment provider
      };
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
    private calendarService: CalendarService,
    private notificationsService: NotificationsService,
    private packagesService: PackagesService,
    private eventEmitter: EventEmitter2,
    private whatsappService: WhatsappService,
  ) { }

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
    return this.prisma.bookingDraft.findUnique({
      where: { customerId }
    });
  }

  /**
   * Get the latest payment for a booking draft
   * Also works if draft doesn't exist - finds payments linked to customer via draft
   */
  async getLatestPaymentForDraft(customerId: string) {
    const draft = await this.getBookingDraft(customerId);
    if (draft) {
      // Draft exists - find payment for this draft
      return this.prisma.payment.findFirst({
        where: { bookingDraftId: draft.id },
        orderBy: { createdAt: 'desc' },
        include: { bookingDraft: true },
      });
    }

    // No draft - find payments for this customer by looking through drafts
    // This handles cases where payment failed and draft might have been cleaned up
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

  /**
   * SECURITY: Check rate limiting for receipt verification attempts
   * Prevents brute force attacks by limiting verification attempts
   */
  async checkReceiptVerificationRateLimit(customerId: string): Promise<{ allowed: boolean; attempts: number; resetTime?: Date }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Count verification attempts in last 5 minutes (could use a separate table, but using payment status changes as proxy)
    // For now, we'll check if there are multiple pending payments (indicating multiple attempts)
    const recentPayments = await this.prisma.payment.findMany({
      where: {
        bookingDraft: { customerId },
        createdAt: { gte: fiveMinutesAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    const maxAttempts = 5; // Allow 5 attempts per 5 minutes
    if (recentPayments.length >= maxAttempts) {
      const oldestAttempt = recentPayments[recentPayments.length - 1];
      const resetTime = new Date(oldestAttempt.createdAt.getTime() + 5 * 60 * 1000);
      return { allowed: false, attempts: recentPayments.length, resetTime };
    }

    return { allowed: true, attempts: recentPayments.length };
  }

  /**
   * Check if a payment prompt was recently sent (within last 5 minutes)
   */
  async hasRecentPaymentPrompt(customerId: string): Promise<boolean> {
    const payment = await this.getLatestPaymentForDraft(customerId);
    if (!payment) return false;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return payment.createdAt > fiveMinutesAgo && payment.status === 'pending';
  }

  /**
   * Verify payment by M-PESA receipt number
   * SECURITY ENHANCED: Verifies receipt through M-Pesa API and validates:
   * - Receipt format (must be valid M-Pesa format)
   * - Receipt matches actual M-Pesa transaction
   * - Payment amount matches
   * - Phone number matches
   * - Transaction is recent (within 24 hours)
   * - Rate limiting to prevent brute force attempts
   */
  async verifyPaymentByReceipt(customerId: string, receiptNumber: string): Promise<{ success: boolean; message: string; payment?: any }> {
    const draft = await this.getBookingDraft(customerId);
    if (!draft) {
      return { success: false, message: "I don't see a pending booking. Would you like to start a new booking?" };
    }

    // SECURITY: Rate limiting - prevent brute force attempts
    const rateLimit = await this.checkReceiptVerificationRateLimit(customerId);
    if (!rateLimit.allowed) {
      this.logger.warn(`[SECURITY] Rate limit exceeded for customer ${customerId}. Attempts: ${rateLimit.attempts}`);
      const resetMinutes = Math.ceil((rateLimit.resetTime!.getTime() - Date.now()) / 1000 / 60);
      return {
        success: false,
        message: `Too many verification attempts. Please wait ${resetMinutes} minute${resetMinutes > 1 ? 's' : ''} before trying again. If you're having issues, contact us at 0720 111928. 💖`,
      };
    }

    // SECURITY: Validate receipt format first (M-Pesa receipts are 10 alphanumeric characters)
    const normalizedReceipt = receiptNumber.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(normalizedReceipt)) {
      this.logger.warn(`[SECURITY] Invalid receipt format provided by customer ${customerId}: ${receiptNumber}`);
      return {
        success: false,
        message: `The receipt number "${receiptNumber}" doesn't look like a valid M-PESA receipt. M-PESA receipts are 10 characters (letters and numbers). Could you please double-check and share it again? 📲`,
      };
    }

    // SECURITY: Check if receipt was already used for another payment (prevent reuse)
    const existingReceiptPayment = await this.prisma.payment.findFirst({
      where: {
        mpesaReceipt: normalizedReceipt,
        status: 'success',
        NOT: { bookingDraftId: draft.id }, // Different booking
      },
    });

    if (existingReceiptPayment) {
      this.logger.warn(`[SECURITY] Receipt ${normalizedReceipt} already used for another payment ${existingReceiptPayment.id} by customer ${customerId}`);
      return {
        success: false,
        message: `This receipt number has already been used for another booking. Each payment receipt can only be used once. Please use the receipt from your current payment, or I can send you a fresh payment prompt. Just say "resend". 📲`,
      };
    }

    // Check if payment already exists with this receipt (already verified)
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

    // Check if there's a pending payment to verify
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

    // SECURITY: Check if payment is too old (prevent using old receipts)
    const paymentAge = Date.now() - new Date(pendingPayment.createdAt).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (paymentAge > maxAge) {
      this.logger.warn(`[SECURITY] Attempt to verify receipt for old payment (${Math.floor(paymentAge / 1000 / 60)} minutes old) by customer ${customerId}`);
      return {
        success: false,
        message: `This payment request is too old. Please start a new booking and I'll send you a fresh payment prompt. 💖`,
      };
    }

    // SECURITY: Verify receipt through M-Pesa API
    try {
      const verification = await this.paymentsService.verifyReceiptWithMpesaAPI(
        pendingPayment.id,
        normalizedReceipt
      );

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

      // Receipt verified! Update payment status
      await this.prisma.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: 'success',
          mpesaReceipt: normalizedReceipt,
        },
      });

      // Confirm the booking
      if (draft.dateTimeIso) {
        const dateObj = new Date(draft.dateTimeIso);
        await this.completeBookingDraft(customerId, dateObj);
      } else if (draft.date && draft.time) {
        // Fallback: parse date and time manually
        const dateStr = draft.date;
        const timeStr = draft.time;
        const combined = `${dateStr}T${timeStr}:00`;
        try {
          const dateObj = new Date(combined);
          if (!isNaN(dateObj.getTime())) {
            await this.completeBookingDraft(customerId, dateObj);
          }
        } catch (error) {
          this.logger.error('Error parsing date/time for receipt verification:', error);
        }
      }

      this.logger.log(`[SECURITY] Receipt ${normalizedReceipt} successfully verified for payment ${pendingPayment.id}`);

      return {
        success: true,
        message: `✅ Payment verified! Receipt ${normalizedReceipt} confirmed through M-PESA. Your booking is now confirmed! You'll receive a confirmation message shortly. 🎉`,
        payment: pendingPayment,
      };
    } catch (error) {
      this.logger.error(`[SECURITY] Error during receipt verification for payment ${pendingPayment.id}:`, error);
      return {
        success: false,
        message: `I encountered an issue verifying your receipt. Please try again, or contact us at 0720 111928 for assistance. 💖`,
      };
    }
  }

  /**
   * Resend payment prompt with updated phone number if needed
   * Works even if draft doesn't exist - can find draft from payment
   */
  async resendPaymentPrompt(customerId: string, newPhone?: string): Promise<{ success: boolean; message: string }> {
    let draft = await this.getBookingDraft(customerId);

    // If no draft, try to find one from the latest payment
    if (!draft) {
      const latestPayment = await this.getLatestPaymentForDraft(customerId);
      if (latestPayment?.bookingDraft) {
        draft = latestPayment.bookingDraft;
        this.logger.debug(`[RESEND] Restored draft from payment ${latestPayment.id}`);
      }
    }

    if (!draft) {
      return { success: false, message: "I don't see a pending booking. Would you like to start a new booking? 💖" };
    }

    // Check if we have all required fields for payment (more flexible than just checking step)
    const hasRequiredFields = draft.service && draft.date && draft.time && draft.name;
    if (!hasRequiredFields) {
      // If draft was cleaned up and missing fields, try to restore from payment
      const latestPayment = await this.getLatestPaymentForDraft(customerId);
      if (latestPayment?.bookingDraft) {
        const paymentDraft = latestPayment.bookingDraft;
        // Restore missing fields from payment's draft if available
        const updates: any = {};
        if (!draft.service && paymentDraft.service) updates.service = paymentDraft.service;
        if (!draft.date && paymentDraft.date) updates.date = paymentDraft.date;
        if (!draft.time && paymentDraft.time) updates.time = paymentDraft.time;
        if (!draft.name && paymentDraft.name) updates.name = paymentDraft.name;
        if (!draft.recipientPhone && paymentDraft.recipientPhone) updates.recipientPhone = paymentDraft.recipientPhone;

        if (Object.keys(updates).length > 0) {
          this.logger.debug(`[RESEND] Restoring missing draft fields from payment: ${JSON.stringify(Object.keys(updates))}`);
          await this.prisma.bookingDraft.update({
            where: { id: draft.id },
            data: updates
          });
          draft = await this.getBookingDraft(customerId);

          // Re-check after restoration
          const hasRequiredFieldsAfterRestore = draft.service && draft.date && draft.time && draft.name;
          if (!hasRequiredFieldsAfterRestore) {
            return { success: false, message: "Your booking isn't ready for payment yet. Let's complete the booking details first! 📋" };
          }
        } else {
          return { success: false, message: "Your booking isn't ready for payment yet. Let's complete the booking details first! 📋" };
        }
      } else {
        return { success: false, message: "Your booking isn't ready for payment yet. Let's complete the booking details first! 📋" };
      }
    }

    // Get phone number - try newPhone, then draft.recipientPhone, then customer.phone
    let phone = newPhone || draft.recipientPhone;
    let originalPhone = phone; // Store original for logging
    if (!phone) {
      // Fallback to customer's phone number
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      phone = customer?.phone;
      originalPhone = phone; // Update original for logging
    }

    // Format phone number to international format (254XXXXXXXXX)
    if (phone) {
      const { formatPhoneNumber } = require('../../utils/booking');
      phone = formatPhoneNumber(phone);
      this.logger.debug(`[RESEND] Formatted phone number: "${originalPhone}" -> "${phone}"`);
    }

    if (!phone) {
      return { success: false, message: "I need your phone number to send the payment prompt. Could you please provide it? 📱" };
    }

    // Update draft with phone number, recipientName, and step if needed
    const updates: any = {};
    if (phone && phone !== draft.recipientPhone) {
      updates.recipientPhone = phone;
    }
    // Default recipientName to name if missing
    if (draft.name && !draft.recipientName) {
      updates.recipientName = draft.name;
    }
    // If we have all required fields, update step to 'confirm'
    if (hasRequiredFields && draft.step !== 'confirm') {
      updates.step = 'confirm';
    }
    if (Object.keys(updates).length > 0) {
      await this.prisma.bookingDraft.update({
        where: { id: draft.id },
        data: updates
      });
      // Reload draft to get updated values
      draft = await this.getBookingDraft(customerId);
    }

    const amount = await this.getDepositForDraft(customerId) || 2000;

    try {
      // Delete old pending payments
      await this.prisma.payment.deleteMany({
        where: {
          bookingDraftId: draft.id,
          status: 'pending'
        }
      });

      // Update phone if new one provided
      if (newPhone && newPhone !== draft.recipientPhone) {
        await this.prisma.bookingDraft.update({
          where: { id: draft.id },
          data: { recipientPhone: newPhone }
        });
      }

      // Initiate new payment
      const result = await this.paymentsService.initiateSTKPush(draft.id, phone, amount);

      return {
        success: true,
        message: `✅ Payment prompt sent! Please check your phone (${phone}) and enter your M-PESA PIN. The prompt should arrive within 10 seconds. 📲💳`
      };
    } catch (error) {
      this.logger.error('Failed to resend payment prompt:', error);
      return {
        success: false,
        message: `Sorry, I encountered an issue sending the payment prompt. Please try again in a moment or contact us at 0720 111928. 💖`
      };
    }
  }

  async getDepositForDraft(customerId: string) {
    const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    if (!draft || !draft.service) return null;
    const pkg = await this.packagesService.findPackageByName(draft.service);
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
    // Remove packageId if present, as bookingDraft does not have this field
    const { packageId, ...rest } = updates;
    // Ensure customer exists before upsert
    let customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      // Auto-create customer if they don't exist (e.g. manual booking for new client)
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

  async deleteBookingDraft(customerId: string) {
    // Use deleteMany to avoid errors if draft doesn't exist
    return this.prisma.bookingDraft.deleteMany({ where: { customerId } });
  }

  /**
   * Check if a booking draft is stale (old draft with failed payment or no recent activity)
   * A draft is considered stale if:
   * - It has a failed payment (regardless of age) - failed payments mean booking didn't complete
   * - It's older than 1 hour with a failed payment (more lenient cleanup)
   * - It's older than 48 hours with no payment attempts
   * - It's older than 7 days regardless of payment status
   */
  async isDraftStale(customerId: string): Promise<boolean> {
    const draft = await this.getBookingDraft(customerId);
    if (!draft) return false;

    const now = new Date();
    const draftAge = now.getTime() - new Date(draft.updatedAt || draft.createdAt).getTime();
    const hoursOld = draftAge / (1000 * 60 * 60);
    const minutesOld = draftAge / (1000 * 60);

    // Draft older than 7 days is always stale
    if (hoursOld > 168) {
      return true;
    }

    // Check payment status
    const latestPayment = await this.getLatestPaymentForDraft(customerId);

    // CRITICAL: Drafts with failed payments are considered stale immediately
    // This prevents showing failed booking details when user asks unrelated questions
    if (latestPayment && latestPayment.status === 'failed') {
      // If payment failed more than 1 hour ago, definitely stale
      if (hoursOld > 1) {
        return true;
      }
      // If payment failed recently (within 1 hour), still consider it stale
      // to prevent showing booking details for non-booking queries
      // But allow retry if user explicitly asks about payment
      return true;
    }

    // Draft older than 48 hours with no payment attempts is stale
    if (!latestPayment && hoursOld > 48) {
      return true;
    }

    return false;
  }

  /**
   * Check if a draft has a failed payment (even if recent)
   * This is used to determine if we should suppress booking details for non-booking queries
   */
  async hasFailedPayment(customerId: string): Promise<boolean> {
    const latestPayment = await this.getLatestPaymentForDraft(customerId);
    return latestPayment?.status === 'failed';
  }

  /**
   * Clean up stale booking drafts for a customer
   * Returns true if a stale draft was found and deleted
   * Also cleans up drafts with failed payments that are older than 1 hour
   * IMPORTANT: Does NOT clean up if there's a pending payment (user might want to resend)
   */
  async cleanupStaleDraft(customerId: string): Promise<boolean> {
    const draft = await this.getBookingDraft(customerId);
    if (!draft) return false;

    // CRITICAL: Don't clean up if there's a pending payment
    // User might want to resend the payment prompt
    const latestPayment = await this.getLatestPaymentForDraft(customerId);
    if (latestPayment && latestPayment.status === 'pending') {
      this.logger.debug(`[CLEANUP] Skipping cleanup - pending payment exists for customer ${customerId}`);
      return false;
    }

    const isStale = await this.isDraftStale(customerId);
    if (isStale) {
      this.logger.debug(`[CLEANUP] Cleaning up stale draft for customer ${customerId}`);
      await this.deleteBookingDraft(customerId);
      return true;
    }

    // Also check if payment failed more than 1 hour ago - clean it up
    if (latestPayment && latestPayment.status === 'failed') {
      const paymentAge = Date.now() - new Date(latestPayment.createdAt).getTime();
      const hoursOld = paymentAge / (1000 * 60 * 60);

      if (hoursOld > 1) {
        this.logger.debug(`[CLEANUP] Cleaning up draft with failed payment (${hoursOld.toFixed(1)} hours old) for customer ${customerId}`);
        await this.deleteBookingDraft(customerId);
        return true;
      }
    }

    return false;
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

    const selectedService = opts.service ? opts.service.trim() : '';
    let packageInfo = null;
    let durationMinutes = 60;
    if (selectedService) {
      packageInfo = await this.packagesService.findPackageByName(selectedService);
      if (!packageInfo) {
        const allPackages = await this.prisma.package.findMany();
        throw new Error(`Service "${selectedService}" not found. Available packages: ${allPackages.map(p => p.name).join(', ')}`);
      }
      durationMinutes = BookingsService.parseDurationToMinutes(packageInfo.duration) || 60;
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
  async checkAvailability(requested: Date, service?: string): Promise<{ available: boolean; suggestions?: string[]; sameDayFull?: boolean }> {
    let duration = 60;
    if (service) {
      const pkg = await this.packagesService.findPackageByName(service);
      if (pkg) duration = BookingsService.parseDurationToMinutes(pkg.duration) || 60;
    }

    // Normalize requested to maternity timezone for slot suggestions
    const requestedDtInMaternity = DateTime.fromJSDate(requested).setZone(this.STUDIO_TZ);
    const dayStart = requestedDtInMaternity.startOf('day').set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
    const dayEnd = requestedDtInMaternity.startOf('day').set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

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

    // Build suggestions: iterate through all slots in the day and pick free ones
    // Prioritize slots closer to the requested time
    const suggestions: string[] = [];
    const allSlots: { time: DateTime; distance: number }[] = [];

    let cursor = dayStart;
    while (cursor < dayEnd) {
      const slotStartUTC = cursor.toUTC();
      const slotEndUTC = slotStartUTC.plus({ minutes: duration });

      const isConflict = occupied.some(o => this.intervalsOverlap(slotStartUTC.toJSDate(), slotEndUTC.toJSDate(), o.start, o.end));
      if (!isConflict) {
        // Calculate distance from requested time (in minutes)
        const distance = Math.abs(cursor.diff(requestedDtInMaternity, 'minutes').minutes);
        allSlots.push({ time: cursor, distance });
      }

      cursor = cursor.plus({ minutes: 30 }); // step by 30 minutes for finer granularity
    }

    // Sort by distance from requested time (closest first), then take up to 10
    allSlots.sort((a, b) => a.distance - b.distance);
    suggestions.push(...allSlots.slice(0, 10).map(s => s.time.toUTC().toISO()));

    // Check if the entire day is fully booked
    const sameDayFull = suggestions.length === 0;

    return { available: false, suggestions, sameDayFull };
  }

  /**
   * Find available slots across multiple days when the requested day is full
   * Checks up to 7 days ahead for available slots
   */
  async findAvailableSlotsAcrossDays(requestedDate: Date, service?: string, daysToCheck: number = 7): Promise<{ date: string; slots: string[] }[]> {
    let duration = 60;
    if (service) {
      const pkg = await this.packagesService.findPackageByName(service);
      if (pkg) duration = BookingsService.parseDurationToMinutes(pkg.duration) || 60;
    }

    const requestedDt = DateTime.fromJSDate(requestedDate).setZone(this.STUDIO_TZ);
    const results: { date: string; slots: string[] }[] = [];

    // Check the requested day and up to daysToCheck days ahead
    for (let dayOffset = 0; dayOffset <= daysToCheck; dayOffset++) {
      const checkDate = requestedDt.plus({ days: dayOffset });
      const dateStr = checkDate.toFormat('yyyy-MM-dd');

      // Skip weekends if needed (optional - adjust based on business rules)
      const dayOfWeek = checkDate.weekday; // 1 = Monday, 7 = Sunday
      // Uncomment if you want to skip weekends:
      // if (dayOfWeek === 7) continue; // Skip Sunday

      const slots = await this.getAvailableSlotsForDate(dateStr, service);
      if (slots.length > 0) {
        results.push({
          date: dateStr,
          slots: slots.slice(0, 5), // Limit to 5 slots per day for display
        });

        // Stop once we have enough days with slots (e.g., 3 days)
        if (results.length >= 3) break;
      }
    }

    return results;
  }

  /* --------------------------
   * getAvailableSlotsForDate: returns Date[] (UTC ISO strings) for easy display
   * -------------------------- */
  async getAvailableSlotsForDate(date: string, service?: string): Promise<string[]> {
    const dateInMaternity = DateTime.fromISO(date, { zone: this.STUDIO_TZ }).startOf('day');
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
      const s = DateTime.fromJSDate(new Date(b.dateTime)).toUTC();
      const dur = b.durationMinutes ?? 60;
      const e = s.plus({ minutes: dur });
      return { start: s.toJSDate(), end: e.toJSDate() };
    });

    let duration = 60;
    if (service) {
      const pkg = await this.packagesService.findPackageByName(service);
      if (pkg) duration = BookingsService.parseDurationToMinutes(pkg.duration) || 60;
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

      // 24-hour policy check
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
        // We can't use this.findPackageByName inside transaction easily unless we refactor to accept tx or just use prisma.package directly
        // For simplicity and since this is less critical, I'll use the same logic inline or just assume exact match for update if not critical
        // But better to be consistent. I'll use the same logic but with tx.

        const cleanName = newService.trim();
        let pkg = await tx.package.findFirst({ where: { name: { equals: cleanName, mode: 'insensitive' } } });
        if (!pkg) pkg = await tx.package.findFirst({ where: { name: { equals: `${cleanName} Package`, mode: 'insensitive' } } });
        if (!pkg) pkg = await tx.package.findFirst({ where: { name: { contains: cleanName, mode: 'insensitive' } } });

        if (pkg) duration = BookingsService.parseDurationToMinutes(pkg.duration) || duration;
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
        include: { customer: true }
      });

      // Update Google Calendar event if it exists
      if (updated.googleEventId) {
        try {
          await this.calendarService.updateEvent(updated.googleEventId, updated);
          // this.logger.log(`Updated Google Calendar event for booking ${bookingId}: ${updated.googleEventId}`);
        } catch (error) {
          this.logger.error(`Failed to update Google Calendar event for booking ${bookingId}`, error);
        }
      }

      // Send rescheduling confirmation
      const msg = `Your appointment has been rescheduled to ${DateTime.fromJSDate(newDateTime).setZone(this.STUDIO_TZ).toFormat('ccc, LLL dd, yyyy HH:mm')}.`;
      try {
        if (updated.customer?.whatsappId) {
          await this.whatsappService.sendMessage(updated.customer.whatsappId, msg);
        } else {
          // Fallback if no whatsappId (though unlikely if they booked via WA)
          // We could try to find by phone, but for now let's just log
          this.logger.warn(`No WhatsApp ID for customer ${updated.customerId}, reschedule msg not sent via WA API`);
        }
      } catch (e) {
        this.logger.error(`Failed to send reschedule notification to ${updated.customerId}`, e);
      }

      return updated;
    });
  }

  async confirmBooking(bookingId: string) {
    // Check if booking was previously provisional (to determine if we should emit event)
    const existingBooking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true }
    });

    if (!existingBooking) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    const wasProvisional = existingBooking.status === 'provisional';

    const booking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' },
      include: { customer: true }
    });

    // Emit booking.created event if this was a provisional booking being confirmed
    if (wasProvisional) {
      this.eventEmitter.emit(
        'booking.created',
        new BookingCreatedEvent(
          booking.id,
          booking.customerId,
          booking.service,
          booking.dateTime,
          booking.customer.name,
        ),
      );
    }

    // Create Google Calendar event
    try {
      const eventId = await this.calendarService.createEvent(booking);
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { googleEventId: eventId },
      });
      // this.logger.log(`Created Google Calendar event for booking ${bookingId}: ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to create Google Calendar event for booking ${bookingId}`, error);
    }

    return booking;
  }

  async cancelBooking(bookingId: string) {
    const currentBooking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!currentBooking) throw new Error('Booking not found');

    // 24-hour policy check
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

    // Delete Google Calendar event if it exists
    if (booking.googleEventId) {
      try {
        await this.calendarService.deleteEvent(booking.googleEventId);
        // this.logger.log(`Deleted Google Calendar event for booking ${bookingId}: ${booking.googleEventId}`);
      } catch (error) {
        this.logger.error(`Failed to delete Google Calendar event for booking ${bookingId}`, error);
      }
    }

    // Send cancellation confirmation
    // Send cancellation confirmation
    const msg = `Your appointment has been cancelled. We hope to see you again soon!`;
    try {
      if (booking.customer?.whatsappId) {
        await this.whatsappService.sendMessage(booking.customer.whatsappId, msg);
      }
    } catch (e) {
      this.logger.error(`Failed to send cancellation notification to ${booking.customerId}`, e);
    }

    return booking;
  }

  async getBookings(customerId?: string) {
    const where = customerId ? { customerId } : {};
    const bookings = await this.prisma.booking.findMany({
      where,
      include: { customer: true },
    });
    return { bookings, total: bookings.length };
  }

  async getBookingById(id: string) {
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

  // Get the latest confirmed booking for a customer
  async getLatestConfirmedBooking(customerId: string) {
    return this.prisma.booking.findFirst({
      where: {
        customerId,
        status: 'confirmed',
      },
      orderBy: { dateTime: 'desc' },
      include: { customer: true },
    });
  }

  /**
   * Formats a comprehensive booking confirmation message with all relevant details
   */
  async formatBookingConfirmationMessage(
    booking: any,
    mpesaReceipt: string,
    reminderTimes: Array<{ days: number; dateTime: DateTime }> = [],
  ): Promise<string> {
    // Fetch package details
    const packageInfo = await this.packagesService.findPackageByName(booking.service);
    if (!packageInfo) {
      // Fallback to basic message if package not found
      return "Payment successful! Your maternity photoshoot booking is now confirmed. We'll send you a reminder closer to the date. 💖";
    }

    // Format DateTime in Africa/Nairobi timezone
    const bookingDateTime = DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
    const formattedDate = bookingDateTime.toFormat('MMMM d, yyyy');
    const formattedTime = bookingDateTime.toFormat('h:mm a');

    // Build package features list
    const features: string[] = [];
    if (packageInfo.images) features.push(`• ${packageInfo.images} soft copy images`);
    if (packageInfo.makeup) features.push(`• Professional makeup`);
    if (packageInfo.outfits) features.push(`• ${packageInfo.outfits} outfit change${packageInfo.outfits > 1 ? 's' : ''}`);
    if (packageInfo.styling) features.push(`• Professional styling`);
    if (packageInfo.wig) features.push(`• Styled wig`);
    if (packageInfo.balloonBackdrop) features.push(`• Customized balloon backdrop`);
    if (packageInfo.photobook) {
      const size = packageInfo.photobookSize ? ` (${packageInfo.photobookSize})` : '';
      features.push(`• Photobook${size}`);
    }
    if (packageInfo.mount) features.push(`• A3 mount`);

    const featuresText = features.length > 0 ? features.join('\n') : '• Custom package features';

    // Format reminders schedule
    let remindersText = '';
    if (reminderTimes.length > 0) {
      const reminderLines = reminderTimes.map(({ days, dateTime }) => {
        const reminderDate = dateTime.setZone('Africa/Nairobi');
        return `• ${reminderDate.toFormat('MMMM d, yyyy')} at ${reminderDate.toFormat('h:mm a')} (${days} day${days > 1 ? 's' : ''} before)`;
      });
      remindersText = `\n\n⏰ *Reminders Scheduled:*\n${reminderLines.join('\n')}`;
    }

    // Helper function to clean up customer name (remove "WhatsApp User" prefix)
    const cleanName = (name: string | null | undefined): string => {
      if (!name) return 'Guest';
      // Remove "WhatsApp User" prefix if present
      const cleaned = name.replace(/^WhatsApp User\s+/i, '').trim();
      return cleaned || 'Guest';
    };

    // Determine the display name: prefer recipientName, then customer name (cleaned)
    const displayName = booking.recipientName
      ? cleanName(booking.recipientName)
      : cleanName(booking.customer?.name);

    // Format the comprehensive message
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

  /**
   * Count bookings for a customer by id, whatsappId, or phone
   * Accepts an object: { id?: string, whatsappId?: string, phone?: string }
   * Returns the number of bookings (all statuses)
   */
  async countBookingsForCustomer(query: { id?: string; whatsappId?: string; phone?: string }): Promise<number> {
    // Build where clause for customer
    let customerWhere: any = {};
    if (query.id) customerWhere.id = query.id;
    if (query.whatsappId) customerWhere.whatsappId = query.whatsappId;
    if (query.phone) customerWhere.phone = query.phone;

    // Find the customer
    const customer = await this.prisma.customer.findFirst({ where: customerWhere });
    if (!customer) return 0;

    // Count bookings for this customer
    return this.prisma.booking.count({ where: { customerId: customer.id } });
  }

  // ...existing code...

  // ...existing code...
  /**
   * Get a summary list of bookings for a customer (date, service, status)
   * Accepts an object: { id?: string, whatsappId?: string, phone?: string }
   * Returns an array of { date, service, status }
   */
  async getBookingSummariesForCustomer(query: { id?: string; whatsappId?: string; phone?: string }): Promise<Array<{ date: string; service: string; status: string }>> {
    // Build where clause for customer
    let customerWhere: any = {};
    if (query.id) customerWhere.id = query.id;
    if (query.whatsappId) customerWhere.whatsappId = query.whatsappId;
    if (query.phone) customerWhere.phone = query.phone;

    // Find the customer
    const customer = await this.prisma.customer.findFirst({ where: customerWhere });
    if (!customer) return [];

    // Get bookings for this customer, most recent first
    const bookings = await this.prisma.booking.findMany({
      where: { customerId: customer.id },
      orderBy: { dateTime: 'desc' },
      take: 10, // limit to last 10 bookings
    });
    // Format summary
    return bookings.map(b => ({
      date: b.dateTime instanceof Date ? b.dateTime.toISOString().slice(0, 10) : String(b.dateTime).slice(0, 10),
      service: b.service,
      status: b.status,
    }));
  }

  /**
   * Helper to parse duration string like '2 hrs 30 mins' to minutes
   */
  private static parseDurationToMinutes(duration: string | null | undefined): number | null {
    if (!duration) return null;
    const hrMatch = duration.match(/(\d+)\s*hr/);
    const minMatch = duration.match(/(\d+)\s*min/);
    let mins = 0;
    if (hrMatch) mins += parseInt(hrMatch[1], 10) * 60;
    if (minMatch) mins += parseInt(minMatch[1], 10);
    return mins || null;
  }

  // State machine for booking draft
  async advanceBookingStep(customerId: string, nextStep: BookingStep) {
    return this.prisma.bookingDraft.update({
      where: { customerId },
      data: { step: nextStep },
    });
  }

  async getBookingStep(customerId: string): Promise<BookingStep> {
    const draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    return (draft?.step as BookingStep) || 'collect_service';
  }

  async editBookingDraft(customerId: string, field: string, value: any) {
    // Allow editing any field in the draft
    return this.prisma.bookingDraft.update({
      where: { customerId },
      data: { [field]: value },
    });
  }

  async reviewBookingDraft(customerId: string) {
    // Return all draft details for review
    return this.prisma.bookingDraft.findUnique({ where: { customerId } });
  }

  async confirmBookingDraft(customerId: string) {
    // Advance to deposit confirmation step
    return this.advanceBookingStep(customerId, 'confirm_deposit');
  }

  async cancelBookingDraft(customerId: string) {
    // Cancel and delete draft (use deleteMany to avoid errors if draft doesn't exist)
    await this.prisma.bookingDraft.deleteMany({ where: { customerId } });
    return true;
  }

  /**
 * Parses user command to edit a booking draft field.
 * Example: "edit date" or "change package"
 */
  async handleEditCommand(customerId: string, command: string, value: string) {
    const editMap: { [key: string]: string } = {
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

        // If phone was updated, check if draft is complete and trigger STK push
        if (editMap[key] === 'recipientPhone') {
          const draft = await this.reviewBookingDraft(customerId);
          if (draft && draft.service && (draft.dateTimeIso || draft.date) && draft.name && draft.recipientPhone) {
            // All required fields present, trigger payment
            await this.completeBookingDraft(customerId);
          }
        }
        return editMap[key];
      }
    }
    return null;
  }

  /**
   * Generates a booking summary for user review.
   */
  async getBookingSummary(customerId: string): Promise<string> {
    const draft = await this.reviewBookingDraft(customerId);
    if (!draft) return 'No booking draft found.';
    return `Please review your booking details:\nPackage: ${draft.service}\nDate: ${draft.date}\nTime: ${draft.time}\nName: ${draft.name}\nPhone: ${draft.recipientPhone}\nReply 'edit [field]' to change any detail, or 'confirm' to proceed.`;
  }
}
