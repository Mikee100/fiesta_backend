import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { RemindersService } from '../modules/reminders/reminders.service';

@Processor('remindersQueue')
@Injectable()
export class RemindersQueueProcessor {
    private readonly logger = new Logger(RemindersQueueProcessor.name);

    constructor(private remindersService: RemindersService) {}

    @Process('send-reminder')
    async handleSendReminder(job: Job<{ reminderId: string }>) {
        const { reminderId } = job.data;
        this.logger.log(`Processing reminder ${reminderId}`);
        try {
            await this.remindersService.sendReminder(reminderId);
            this.logger.log(`Successfully sent reminder ${reminderId}`);
        } catch (error: any) {
            // Check if this is a test mode restriction (expected in dev/test)
            if (error?.isTestModeRestriction) {
                this.logger.warn(`Reminder ${reminderId} processed with test mode restriction - message marked as sent but may not be delivered`);
                // Don't throw - the service already handled it gracefully
                return;
            }
            this.logger.error(`Failed to send reminder ${reminderId}`, error);
            throw error;
        }
    }
}
