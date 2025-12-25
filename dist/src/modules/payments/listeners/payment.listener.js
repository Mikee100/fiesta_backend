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
var PaymentListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentListener = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const booking_events_1 = require("../../bookings/events/booking.events");
const payments_service_1 = require("../payments.service");
const messages_service_1 = require("../../messages/messages.service");
const prisma_service_1 = require("../../../prisma/prisma.service");
let PaymentListener = PaymentListener_1 = class PaymentListener {
    constructor(paymentsService, messagesService, prisma) {
        this.paymentsService = paymentsService;
        this.messagesService = messagesService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(PaymentListener_1.name);
    }
    async handleBookingDraftCompleted(event) {
        this.logger.error(`[DEBUG-TRACE] ⚡ BookingDraftCompleted event received: customerId=${event.customerId}`);
        this.logger.log(`[Event] ⚡ BookingDraftCompleted event received: customerId=${event.customerId}, draftId=${event.draftId}, amount=${event.depositAmount}`);
        try {
            let phone = event.recipientPhone;
            if (!phone.startsWith('254')) {
                phone = `254${phone.replace(/^0+/, '')}`;
            }
            const customer = await this.prisma.customer.findUnique({
                where: { id: event.customerId },
                select: { instagramId: true, whatsappId: true }
            });
            const platform = customer?.instagramId ? 'instagram' : 'whatsapp';
            const prepaymentMsg = `⏱️ *Get Ready!*\n\nYou'll receive an M-Pesa payment prompt on your phone in the next 3 seconds for *KSH ${event.depositAmount}*.\n\nPlease have your M-Pesa PIN ready! 📲✨`;
            try {
                await this.messagesService.sendOutboundMessage(event.customerId, prepaymentMsg, platform);
                this.logger.log(`[Event] Pre-payment notification sent to ${event.customerId} via ${platform}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (msgError) {
                this.logger.warn(`[Event] Failed to send pre-payment notification, continuing with STK push:`, msgError);
            }
            this.logger.log(`[Event] Calling initiateSTKPush with draftId=${event.draftId}, phone=${phone}, amount=${event.depositAmount}`);
            const result = await this.paymentsService.initiateSTKPush(event.draftId, phone, event.depositAmount);
            this.logger.log(`[Event] ✅ STK Push successfully initiated for deposit of ${event.depositAmount} KSH for draft ${event.draftId}, CheckoutRequestID: ${result.checkoutRequestId}`);
        }
        catch (error) {
            this.logger.error(`[Event] ❌ Failed to initiate STK Push for draft ${event.draftId}`, error);
            this.logger.error(`[Event] Error details:`, {
                message: error.message,
                stack: error.stack,
                response: error.response?.data,
            });
        }
    }
};
exports.PaymentListener = PaymentListener;
__decorate([
    (0, event_emitter_1.OnEvent)('booking.draft.completed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [booking_events_1.BookingDraftCompletedEvent]),
    __metadata("design:returntype", Promise)
], PaymentListener.prototype, "handleBookingDraftCompleted", null);
exports.PaymentListener = PaymentListener = PaymentListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        messages_service_1.MessagesService,
        prisma_service_1.PrismaService])
], PaymentListener);
//# sourceMappingURL=payment.listener.js.map