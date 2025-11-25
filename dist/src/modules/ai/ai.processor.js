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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const ai_service_1 = require("./ai.service");
const messages_service_1 = require("../messages/messages.service");
let AiProcessor = class AiProcessor {
    constructor(aiService, messagesService) {
        this.aiService = aiService;
        this.messagesService = messagesService;
    }
    async handleReminder(job) {
        const { customerId, bookingId, date, time, recipientName } = job.data;
        const reminderMessage = `Hi ${recipientName}! 💖\n\n` +
            `Just a sweet reminder that your maternity photoshoot ` +
            `is coming up in *2 days* — on *${date} at ${time}*. ` +
            `We’re excited to capture your beautiful moments! ✨📸`;
        await this.messagesService.sendOutboundMessage(customerId, reminderMessage, 'whatsapp');
        return true;
    }
};
exports.AiProcessor = AiProcessor;
__decorate([
    (0, bull_1.Process)('sendReminder'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiProcessor.prototype, "handleReminder", null);
exports.AiProcessor = AiProcessor = __decorate([
    (0, bull_1.Processor)('aiQueue'),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        messages_service_1.MessagesService])
], AiProcessor);
//# sourceMappingURL=ai.processor.js.map