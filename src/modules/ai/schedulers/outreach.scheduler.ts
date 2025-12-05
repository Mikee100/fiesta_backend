// src/modules/ai/schedulers/outreach.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProactiveOutreachService } from '../services/proactive-outreach.service';

@Injectable()
export class OutreachScheduler {
    private readonly logger = new Logger(OutreachScheduler.name);

    constructor(private proactiveOutreach: ProactiveOutreachService) { }

    /**
     * Check for abandoned bookings every hour
     */
    @Cron(CronExpression.EVERY_HOUR)
    async checkAbandonedBookings() {
        this.logger.log('Checking for abandoned bookings...');
        try {
            const count = await this.proactiveOutreach.detectAbandonedBookings();
            this.logger.log(`Scheduled ${count} abandoned booking follow-ups`);
        } catch (error) {
            this.logger.error('Error checking abandoned bookings:', error);
        }
    }

    /**
     * Check for post-shoot follow-ups every 6 hours
     */
    @Cron(CronExpression.EVERY_6_HOURS)
    async checkPostShootFollowups() {
        this.logger.log('Checking for post-shoot follow-ups...');
        try {
            const count = await this.proactiveOutreach.sendPostShootFollowup();
            this.logger.log(`Sent ${count} post-shoot follow-ups`);
        } catch (error) {
            this.logger.error('Error sending post-shoot follow-ups:', error);
        }
    }

    /**
     * Check for re-engagement opportunities daily
     */
    @Cron(CronExpression.EVERY_DAY_AT_10AM)
    async checkReengagement() {
        this.logger.log('Checking for re-engagement opportunities...');
        try {
            const count = await this.proactiveOutreach.reengageInactiveCustomers();
            this.logger.log(`Re-engaged ${count} inactive customers`);
        } catch (error) {
            this.logger.error('Error re-engaging customers:', error);
        }
    }

    /**
     * Check for milestones daily
     */
    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async checkMilestones() {
        this.logger.log('Checking for customer milestones...');
        try {
            const count = await this.proactiveOutreach.celebrateMilestones();
            this.logger.log(`Celebrated ${count} milestones`);
        } catch (error) {
            this.logger.error('Error celebrating milestones:', error);
        }
    }

    /**
     * Check for pregnancy milestones weekly
     */
    @Cron(CronExpression.EVERY_WEEK)
    async checkPregnancyMilestones() {
        this.logger.log('Checking for pregnancy milestones...');
        try {
            const count = await this.proactiveOutreach.schedulePregnancyMilestones();
            this.logger.log(`Scheduled ${count} pregnancy milestone outreaches`);
        } catch (error) {
            this.logger.error('Error scheduling pregnancy milestones:', error);
        }
    }
}
