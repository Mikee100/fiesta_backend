import { Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Worker, Job } from 'bullmq';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
@Processor('bookingQueue')
export class BookingQueueProcessor {
  private readonly logger = new Logger(BookingQueueProcessor.name);
  private readonly STUDIO_TZ = 'Africa/Nairobi';

  constructor(
    private bookingsService: BookingsService,
    private prisma: PrismaService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
  ) {}

  async process(job: Job<any>): Promise<any> {
    const { bookingId } = job.data;
    // Confirm booking
    await this.bookingsService.confirmBooking(bookingId);

    // Fetch the booking to get dateTime and customerId
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true },
    });
    if (!booking) {
      this.logger.error(`Booking not found for id=${bookingId}`);
      return { confirmed: true, error: 'Booking not found' };
    }

    // Determine platform: prioritize WhatsApp, then Instagram, then Messenger
    const customer = booking.customer;
    let platform = 'whatsapp';
    if (!customer.whatsappId) {
      if (customer.instagramId) {
        platform = 'instagram';
      } else if (customer.messengerId) {
        platform = 'messenger';
      } else {
        this.logger.warn(`No platform ID found for customerId=${customer.id}, skipping reminders`);
        return { confirmed: true };
      }
    }

    // Schedule reminder: 2 days before shooting
    const reminderDelay = booking.dateTime.getTime() - Date.now() - 2 * 24 * 60 * 60 * 1000;
    if (reminderDelay > 0) {
      const reminderContent = `Hi ${customer.name}! Just a gentle reminder that your maternity photoshoot (${booking.service}) is coming up in 2 days, on ${DateTime.fromJSDate(booking.dateTime).setZone(this.STUDIO_TZ).toFormat('ccc, LLL dd, yyyy \'at\' HH:mm')}. We're so excited to capture your beautiful glow! If you have any questions, feel free to reach out. 💖 Location: 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor.`;
      await this.messageQueue.add('sendOutboundMessage', {
        customerId: customer.id,
        content: reminderContent,
        platform,
      }, { delay: reminderDelay });
      this.logger.log(`Scheduled reminder for bookingId=${bookingId} at ${new Date(Date.now() + reminderDelay).toISOString()}`);
    } else {
      this.logger.warn(`Reminder delay negative for bookingId=${bookingId}, skipping reminder`);
    }

    // Schedule follow-up: 1 day after shooting
    const followupDelay = booking.dateTime.getTime() - Date.now() + 24 * 60 * 60 * 1000;
    if (followupDelay > 0) {
      const followupContent = `Hi ${customer.name}! How was your maternity photoshoot yesterday? We'd love to hear your thoughts and see how you're feeling. If you have any feedback or need your images, just let us know. Thank you for choosing us! 💖`;
      await this.messageQueue.add('sendOutboundMessage', {
        customerId: customer.id,
        content: followupContent,
        platform,
      }, { delay: followupDelay });
      this.logger.log(`Scheduled follow-up for bookingId=${bookingId} at ${new Date(Date.now() + followupDelay).toISOString()}`);
    } else {
      this.logger.warn(`Follow-up delay negative for bookingId=${bookingId}, skipping follow-up`);
    }

    return { confirmed: true };
  }
}
