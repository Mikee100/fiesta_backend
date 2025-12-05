// src/modules/ai/processors/outreach.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ProactiveOutreachService } from '../services/proactive-outreach.service';

@Processor('outreachQueue')
export class OutreachProcessor {
    private readonly logger = new Logger(OutreachProcessor.name);

    constructor(private proactiveOutreach: ProactiveOutreachService) { }

    @Process('send-outreach')
    async handleSendOutreach(job: Job) {
        const { outreachId } = job.data;

        this.logger.log(`Processing outreach ${outreachId}`);

        try {
            await this.proactiveOutreach.processOutreach(outreachId);
            return { success: true, outreachId };
        } catch (error) {
            this.logger.error(`Failed to process outreach ${outreachId}:`, error);
            throw error; // Bull will retry
        }
    }
}
