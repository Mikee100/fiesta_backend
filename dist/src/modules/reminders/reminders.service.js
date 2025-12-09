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
var RemindersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const luxon_1 = require("luxon");
let RemindersService = RemindersService_1 = class RemindersService {
    constructor(prisma, whatsappService, remindersQueue) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
        this.remindersQueue = remindersQueue;
        this.logger = new common_1.Logger(RemindersService_1.name);
        this.STUDIO_TZ = 'Africa/Nairobi';
    }
    async scheduleRemindersForBooking(bookingId) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { customer: true },
        });
        if (!booking) {
            throw new common_1.NotFoundException(`Booking ${bookingId} not found`);
        }
        const bookingDateTime = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone(this.STUDIO_TZ);
        const reminder48hr = bookingDateTime.minus({ hours: 48 });
        const reminder24hr = bookingDateTime.minus({ hours: 24 });
        const reminders = [];
        if (reminder48hr > luxon_1.DateTime.now()) {
            const reminder48 = await this.createReminder({
                bookingId,
                type: '48hr',
                scheduledFor: reminder48hr.toISO(),
            });
            reminders.push(reminder48);
            await this.remindersQueue.add('send-reminder', { reminderId: reminder48.id }, { delay: reminder48hr.diff(luxon_1.DateTime.now()).milliseconds });
        }
        if (reminder24hr > luxon_1.DateTime.now()) {
            const reminder24 = await this.createReminder({
                bookingId,
                type: '24hr',
                scheduledFor: reminder24hr.toISO(),
            });
            reminders.push(reminder24);
            await this.remindersQueue.add('send-reminder', { reminderId: reminder24.id }, { delay: reminder24hr.diff(luxon_1.DateTime.now()).milliseconds });
        }
        this.logger.log(`Scheduled ${reminders.length} reminders for booking ${bookingId}`);
        return reminders;
    }
    async createReminder(data) {
        return this.prisma.bookingReminder.create({
            data: {
                bookingId: data.bookingId,
                type: data.type,
                scheduledFor: new Date(data.scheduledFor),
                messageContent: data.messageContent,
            },
        });
    }
    async getReminders(filters) {
        const where = {};
        if (filters.bookingId)
            where.bookingId = filters.bookingId;
        if (filters.type)
            where.type = filters.type;
        if (filters.status)
            where.status = filters.status;
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
    async getReminderById(id) {
        const reminder = await this.prisma.bookingReminder.findUnique({
            where: { id },
            include: {
                booking: {
                    include: { customer: true },
                },
            },
        });
        if (!reminder) {
            throw new common_1.NotFoundException(`Reminder ${id} not found`);
        }
        return reminder;
    }
    async updateReminder(id, data) {
        return this.prisma.bookingReminder.update({
            where: { id },
            data: {
                ...(data.scheduledFor && { scheduledFor: new Date(data.scheduledFor) }),
                ...(data.status && { status: data.status }),
                ...(data.messageContent && { messageContent: data.messageContent }),
            },
        });
    }
    async cancelRemindersForBooking(bookingId) {
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
    async rescheduleRemindersForBooking(bookingId, newDateTime) {
        await this.cancelRemindersForBooking(bookingId);
        return this.scheduleRemindersForBooking(bookingId);
    }
    async sendReminder(reminderId) {
        const reminder = await this.getReminderById(reminderId);
        if (reminder.status !== 'pending') {
            this.logger.warn(`Reminder ${reminderId} is not pending (status: ${reminder.status})`);
            return reminder;
        }
        try {
            const message = this.generateReminderMessage(reminder);
            const customerPhone = reminder.booking.customer.whatsappId || reminder.booking.customer.phone;
            if (customerPhone) {
                await this.whatsappService.sendMessage(customerPhone, message);
            }
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
        }
        catch (error) {
            this.logger.error(`Failed to send reminder ${reminderId}`, error);
            await this.updateReminder(reminderId, { status: 'failed' });
            throw error;
        }
    }
    generateReminderMessage(reminder) {
        const booking = reminder.booking;
        const bookingDateTime = luxon_1.DateTime.fromJSDate(booking.dateTime).setZone(this.STUDIO_TZ);
        const formattedDate = bookingDateTime.toFormat('EEEE, MMMM d, yyyy');
        const formattedTime = bookingDateTime.toFormat('h:mm a');
        const cleanName = (name) => {
            if (!name)
                return 'there';
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
        }
        else if (reminder.type === '24hr') {
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
        }
        else {
            return `✅ *Booking Confirmed!*

Your maternity photoshoot is confirmed for:
📅 ${formattedDate} at ${formattedTime}

We'll send you reminders as the date approaches. Looking forward to seeing you! 💖`;
        }
    }
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
};
exports.RemindersService = RemindersService;
exports.RemindersService = RemindersService = RemindersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)('remindersQueue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService, Object])
], RemindersService);
//# sourceMappingURL=reminders.service.js.map