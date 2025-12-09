import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { DateTime } from 'luxon';
import { CreateReminderDto, UpdateReminderDto, ReminderFilterDto } from './dto/reminder.dto';

@Injectable()
export class RemindersService {
    private readonly logger = new Logger(RemindersService.name);
    private readonly STUDIO_TZ = 'Africa/Nairobi';

    constructor(
        private prisma: PrismaService,
        private whatsappService: WhatsappService,
        @InjectQueue('remindersQueue') private remindersQueue: Queue,
    ) { }

    /**
     * Schedule reminders for a booking (48hr and 24hr before)
     */
    async scheduleRemindersForBooking(bookingId: string) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { customer: true },
        });

        if (!booking) {
            throw new NotFoundException(`Booking ${bookingId} not found`);
        }

        const bookingDateTime = DateTime.fromJSDate(booking.dateTime).setZone(this.STUDIO_TZ);

        // Schedule 48-hour reminder
        const reminder48hr = bookingDateTime.minus({ hours: 48 });
        const reminder24hr = bookingDateTime.minus({ hours: 24 });

        const reminders = [];

        // Only schedule if the reminder time is in the future
        if (reminder48hr > DateTime.now()) {
            const reminder48 = await this.createReminder({
                bookingId,
                type: '48hr',
                scheduledFor: reminder48hr.toISO(),
            });
            reminders.push(reminder48);

            // Queue the job
            await this.remindersQueue.add(
                'send-reminder',
                { reminderId: reminder48.id },
                { delay: reminder48hr.diff(DateTime.now()).milliseconds },
            );
        }

        if (reminder24hr > DateTime.now()) {
            const reminder24 = await this.createReminder({
                bookingId,
                type: '24hr',
                scheduledFor: reminder24hr.toISO(),
            });
            reminders.push(reminder24);

            // Queue the job
            await this.remindersQueue.add(
                'send-reminder',
                { reminderId: reminder24.id },
                { delay: reminder24hr.diff(DateTime.now()).milliseconds },
            );
        }

        this.logger.log(`Scheduled ${reminders.length} reminders for booking ${bookingId}`);
        return reminders;
    }

    /**
     * Create a reminder record
     */
    async createReminder(data: CreateReminderDto) {
        return this.prisma.bookingReminder.create({
            data: {
                bookingId: data.bookingId,
                type: data.type,
                scheduledFor: new Date(data.scheduledFor),
                messageContent: data.messageContent,
            },
        });
    }

    /**
     * Get reminders with filters
     */
    async getReminders(filters: ReminderFilterDto) {
        const where: any = {};

        if (filters.bookingId) where.bookingId = filters.bookingId;
        if (filters.type) where.type = filters.type;
        if (filters.status) where.status = filters.status;

        const limit = filters.limit ? parseInt(filters.limit) : 50;
        const offset = filters.offset ? parseInt(filters.offset) : 0;

        const [reminders, total] = await Promise.all([
            this.prisma.bookingReminder.findMany({
                where,
                include: {
                    booking: {
                        include: { customer: true },
                    },
                },
                orderBy: { scheduledFor: 'asc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.bookingReminder.count({ where }),
        ]);

        return { reminders, total };
    }

    /**
     * Get reminder by ID
     */
    async getReminderById(id: string) {
        const reminder = await this.prisma.bookingReminder.findUnique({
            where: { id },
            include: {
                booking: {
                    include: { customer: true },
                },
            },
        });

        if (!reminder) {
            throw new NotFoundException(`Reminder ${id} not found`);
        }

        return reminder;
    }

    /**
     * Update reminder
     */
    async updateReminder(id: string, data: UpdateReminderDto) {
        return this.prisma.bookingReminder.update({
            where: { id },
            data: {
                ...(data.scheduledFor && { scheduledFor: new Date(data.scheduledFor) }),
                ...(data.status && { status: data.status }),
                ...(data.messageContent && { messageContent: data.messageContent }),
            },
        });
    }

    /**
     * Cancel all reminders for a booking
     */
    async cancelRemindersForBooking(bookingId: string) {
        const result = await this.prisma.bookingReminder.updateMany({
            where: {
                bookingId,
                status: 'pending',
            },
            data: {
                status: 'cancelled',
            },
        });

        this.logger.log(`Cancelled ${result.count} reminders for booking ${bookingId}`);
        return result;
    }

    /**
     * Reschedule reminders when booking time changes
     */
    async rescheduleRemindersForBooking(bookingId: string, newDateTime: Date) {
        // Cancel existing reminders
        await this.cancelRemindersForBooking(bookingId);

        // Schedule new reminders
        return this.scheduleRemindersForBooking(bookingId);
    }

    /**
     * Send a reminder immediately (manual trigger or queue processor)
     */
    async sendReminder(reminderId: string) {
        const reminder = await this.getReminderById(reminderId);

        if (reminder.status !== 'pending') {
            this.logger.warn(`Reminder ${reminderId} is not pending (status: ${reminder.status})`);
            return reminder;
        }

        try {
            const message = this.generateReminderMessage(reminder);

            // Send via WhatsApp
            const customerPhone = reminder.booking.customer.whatsappId || reminder.booking.customer.phone;
            if (customerPhone) {
                await this.whatsappService.sendMessage(customerPhone, message);
            }

            // Update reminder status
            await this.updateReminder(reminderId, {
                status: 'sent',
                messageContent: message,
            });

            await this.prisma.bookingReminder.update({
                where: { id: reminderId },
                data: { sentAt: new Date() },
            });

            this.logger.log(`Sent reminder ${reminderId} for booking ${reminder.bookingId}`);
            return await this.getReminderById(reminderId);
        } catch (error) {
            this.logger.error(`Failed to send reminder ${reminderId}`, error);
            await this.updateReminder(reminderId, { status: 'failed' });
            throw error;
        }
    }

    /**
     * Generate reminder message based on type
     */
    private generateReminderMessage(reminder: any): string {
        const booking = reminder.booking;
        const bookingDateTime = DateTime.fromJSDate(booking.dateTime).setZone(this.STUDIO_TZ);
        const formattedDate = bookingDateTime.toFormat('EEEE, MMMM d, yyyy');
        const formattedTime = bookingDateTime.toFormat('h:mm a');

        // Helper function to clean up customer name (remove "WhatsApp User" prefix)
        const cleanName = (name: string | null | undefined): string => {
            if (!name) return 'there';
            const cleaned = name.replace(/^WhatsApp User\s+/i, '').trim();
            return cleaned || 'there';
        };

        const displayName = booking.recipientName 
            ? cleanName(booking.recipientName)
            : cleanName(booking.customer?.name);

        if (reminder.type === '48hr') {
            return `🌸 *Reminder: Your Maternity Photoshoot is in 2 Days!* 🌸

Hi ${displayName}! 💖

Your beautiful maternity photoshoot is coming up soon:
📅 *Date:* ${formattedDate}
⏰ *Time:* ${formattedTime}
📦 *Package:* ${booking.service}

📝 *What to Bring:*
• Comfortable shoes for walking
• Any personal props you'd like to include
• Positive energy and your beautiful smile! ✨

💡 *Helpful Tips:*
• Arrive 15 minutes early if you have makeup included
• Wear comfortable clothing (you'll change into your shoot outfits here)
• Stay hydrated and get good rest the night before

📍 *Location:* 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor

We can't wait to capture your beautiful journey! If you have any questions, feel free to reach out. 💕

See you soon! 🌟`;
        } else if (reminder.type === '24hr') {
            return `⏰ *Tomorrow is Your Special Day!* ⏰

Hi ${displayName}! 💖

Just a friendly reminder that your maternity photoshoot is tomorrow:
📅 *Date:* ${formattedDate}
⏰ *Time:* ${formattedTime}
📦 *Package:* ${booking.service}

📍 *Location:* 
Fiesta House Attire
4th Avenue Parklands
Diamond Plaza Annex, 2nd Floor

🚗 *Parking:* Available on-site

We're so excited to see you tomorrow and capture these precious moments! 💕✨

If you need to reach us: 0720 111928`;
        } else {
            return `✅ *Booking Confirmed!*

Your maternity photoshoot is confirmed for:
📅 ${formattedDate} at ${formattedTime}

We'll send you reminders as the date approaches. Looking forward to seeing you! 💖`;
        }
    }

    /**
     * Get upcoming reminders (for dashboard/monitoring)
     */
    async getUpcomingReminders(limit = 10) {
        return this.prisma.bookingReminder.findMany({
            where: {
                status: 'pending',
                scheduledFor: {
                    gte: new Date(),
                },
            },
            include: {
                booking: {
                    include: { customer: true },
                },
            },
            orderBy: { scheduledFor: 'asc' },
            take: limit,
        });
    }
}
