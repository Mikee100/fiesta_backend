"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingMessageService = void 0;
const common_1 = require("@nestjs/common");
let BookingMessageService = class BookingMessageService {
    getMessage(step, data, platform) {
        switch (step) {
            case 'collect_service':
                return this.format(`Which package would you like to book?`, platform);
            case 'collect_date':
                return this.format(`What date would you prefer for your session?`, platform);
            case 'collect_time':
                return this.format(`What time works best for you?`, platform);
            case 'collect_name':
                return this.format(`May I have your name for the booking?`, platform);
            case 'review':
                return this.format(`Please review your booking details:\nPackage: ${data.service}\nDate: ${data.date}\nTime: ${data.time}\nName: ${data.name}\nReply 'edit [field]' to change any detail, or 'confirm' to proceed.`, platform);
            case 'confirm_deposit':
                return this.format(`To confirm your booking, a deposit of KSH ${data.deposit} is required. Reply 'confirm' to accept and receive the payment prompt.`, platform);
            case 'confirmed':
                return this.format(`Your booking is confirmed! 🎉`, platform);
            case 'cancelled':
                return this.format(`Your booking has been cancelled.`, platform);
            default:
                return this.format(`How can I help you with your booking?`, platform);
        }
    }
    format(message, platform) {
        if (platform === 'instagram') {
            return message.replace(/\n/g, '\n');
        }
        if (platform === 'whatsapp') {
            return message.replace(/\n/g, '\n');
        }
        return message;
    }
};
exports.BookingMessageService = BookingMessageService;
exports.BookingMessageService = BookingMessageService = __decorate([
    (0, common_1.Injectable)()
], BookingMessageService);
//# sourceMappingURL=booking-message.service.js.map