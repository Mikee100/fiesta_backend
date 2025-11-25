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
var BookingQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingQueueProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bull_2 = require("@nestjs/bull");
const bookings_service_1 = require("../src/modules/bookings/bookings.service");
const prisma_service_1 = require("../src/prisma/prisma.service");
const luxon_1 = require("luxon");
let BookingQueueProcessor = BookingQueueProcessor_1 = class BookingQueueProcessor {
    constructor(bookingsService, prisma, messageQueue) {
        this.bookingsService = bookingsService;
        this.prisma = prisma;
        this.messageQueue = messageQueue;
        this.logger = new common_1.Logger(BookingQueueProcessor_1.name);
        this.STUDIO_TZ = 'Africa/Nairobi';
    }
    async process(job) {
        const { bookingId } = job.data;
        await this.bookingsService.confirmBooking(bookingId);
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { customer: true },
        });
        if (!booking) {
            this.logger.error(`Booking not found for id=${bookingId}`);
            return { confirmed: true, error: 'Booking not found' };
        }
        const customer = booking.customer;
        let platform = 'whatsapp';
        if (!customer.whatsappId) {
            if (customer.instagramId) {
                platform = 'instagram';
            }
            else if (customer.messengerId) {
                platform = 'messenger';
            }
            else {
                this.logger.warn(`No platform ID found for customerId=${customer.id}, skipping reminders`);
                return { confirmed: true };
            }
        }
        const reminderDelay = booking.dateTime.getTime() - Date.now() - 2 * 24 * 60 * 60 * 1000;
        if (reminderDelay > 0) {
            const reminderContent = `Hi ${customer.name}! Just a gentle reminder that your maternity photoshoot (${booking.service}) is coming up in 2 days, on ${luxon_1.DateTime.fromJSDate(booking.dateTime).setZone(this.STUDIO_TZ).toFormat('ccc, LLL dd, yyyy \'at\' HH:mm')}. We're so excited to capture your beautiful glow! If you have any questions, feel free to reach out. 💖 Location: 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor.`;
            await this.messageQueue.add('sendOutboundMessage', {
                customerId: customer.id,
                content: reminderContent,
                platform,
            }, { delay: reminderDelay });
            this.logger.log(`Scheduled reminder for bookingId=${bookingId} at ${new Date(Date.now() + reminderDelay).toISOString()}`);
        }
        else {
            this.logger.warn(`Reminder delay negative for bookingId=${bookingId}, skipping reminder`);
        }
        const followupDelay = booking.dateTime.getTime() - Date.now() + 24 * 60 * 60 * 1000;
        if (followupDelay > 0) {
            const followupContent = `Hi ${customer.name}! How was your maternity photoshoot yesterday? We'd love to hear your thoughts and see how you're feeling. If you have any feedback or need your images, just let us know. Thank you for choosing us! 💖`;
            await this.messageQueue.add('sendOutboundMessage', {
                customerId: customer.id,
                content: followupContent,
                platform,
            }, { delay: followupDelay });
            this.logger.log(`Scheduled follow-up for bookingId=${bookingId} at ${new Date(Date.now() + followupDelay).toISOString()}`);
        }
        else {
            this.logger.warn(`Follow-up delay negative for bookingId=${bookingId}, skipping follow-up`);
        }
        return { confirmed: true };
    }
};
exports.BookingQueueProcessor = BookingQueueProcessor;
exports.BookingQueueProcessor = BookingQueueProcessor = BookingQueueProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bull_1.Processor)('bookingQueue'),
    __param(2, (0, bull_2.InjectQueue)('messageQueue')),
    __metadata("design:paramtypes", [bookings_service_1.BookingsService,
        prisma_service_1.PrismaService, Object])
], BookingQueueProcessor);
//# sourceMappingURL=booking-queue.processor.js.map