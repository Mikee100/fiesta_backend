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
var RemindersQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersQueueProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const reminders_service_1 = require("../modules/reminders/reminders.service");
let RemindersQueueProcessor = RemindersQueueProcessor_1 = class RemindersQueueProcessor {
    constructor(remindersService) {
        this.remindersService = remindersService;
        this.logger = new common_1.Logger(RemindersQueueProcessor_1.name);
    }
    async handleSendReminder(job) {
        const { reminderId } = job.data;
        this.logger.log(`Processing reminder ${reminderId}`);
        try {
            await this.remindersService.sendReminder(reminderId);
            this.logger.log(`Successfully sent reminder ${reminderId}`);
        }
        catch (error) {
            if (error?.isTestModeRestriction) {
                this.logger.warn(`Reminder ${reminderId} processed with test mode restriction - message marked as sent but may not be delivered`);
                return;
            }
            this.logger.error(`Failed to send reminder ${reminderId}`, error);
            throw error;
        }
    }
};
exports.RemindersQueueProcessor = RemindersQueueProcessor;
__decorate([
    (0, bull_1.Process)('send-reminder'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RemindersQueueProcessor.prototype, "handleSendReminder", null);
exports.RemindersQueueProcessor = RemindersQueueProcessor = RemindersQueueProcessor_1 = __decorate([
    (0, bull_1.Processor)('remindersQueue'),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reminders_service_1.RemindersService])
], RemindersQueueProcessor);
//# sourceMappingURL=reminders-queue.processor.js.map