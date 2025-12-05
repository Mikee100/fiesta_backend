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
var OutreachScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutreachScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const proactive_outreach_service_1 = require("../services/proactive-outreach.service");
let OutreachScheduler = OutreachScheduler_1 = class OutreachScheduler {
    constructor(proactiveOutreach) {
        this.proactiveOutreach = proactiveOutreach;
        this.logger = new common_1.Logger(OutreachScheduler_1.name);
    }
    async checkAbandonedBookings() {
        this.logger.log('Checking for abandoned bookings...');
        try {
            const count = await this.proactiveOutreach.detectAbandonedBookings();
            this.logger.log(`Scheduled ${count} abandoned booking follow-ups`);
        }
        catch (error) {
            this.logger.error('Error checking abandoned bookings:', error);
        }
    }
    async checkPostShootFollowups() {
        this.logger.log('Checking for post-shoot follow-ups...');
        try {
            const count = await this.proactiveOutreach.sendPostShootFollowup();
            this.logger.log(`Sent ${count} post-shoot follow-ups`);
        }
        catch (error) {
            this.logger.error('Error sending post-shoot follow-ups:', error);
        }
    }
    async checkReengagement() {
        this.logger.log('Checking for re-engagement opportunities...');
        try {
            const count = await this.proactiveOutreach.reengageInactiveCustomers();
            this.logger.log(`Re-engaged ${count} inactive customers`);
        }
        catch (error) {
            this.logger.error('Error re-engaging customers:', error);
        }
    }
    async checkMilestones() {
        this.logger.log('Checking for customer milestones...');
        try {
            const count = await this.proactiveOutreach.celebrateMilestones();
            this.logger.log(`Celebrated ${count} milestones`);
        }
        catch (error) {
            this.logger.error('Error celebrating milestones:', error);
        }
    }
    async checkPregnancyMilestones() {
        this.logger.log('Checking for pregnancy milestones...');
        try {
            const count = await this.proactiveOutreach.schedulePregnancyMilestones();
            this.logger.log(`Scheduled ${count} pregnancy milestone outreaches`);
        }
        catch (error) {
            this.logger.error('Error scheduling pregnancy milestones:', error);
        }
    }
};
exports.OutreachScheduler = OutreachScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutreachScheduler.prototype, "checkAbandonedBookings", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_6_HOURS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutreachScheduler.prototype, "checkPostShootFollowups", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_10AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutreachScheduler.prototype, "checkReengagement", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_9AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutreachScheduler.prototype, "checkMilestones", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_WEEK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutreachScheduler.prototype, "checkPregnancyMilestones", null);
exports.OutreachScheduler = OutreachScheduler = OutreachScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [proactive_outreach_service_1.ProactiveOutreachService])
], OutreachScheduler);
//# sourceMappingURL=outreach.scheduler.js.map