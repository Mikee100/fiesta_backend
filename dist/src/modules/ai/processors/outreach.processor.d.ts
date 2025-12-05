import { Job } from 'bull';
import { ProactiveOutreachService } from '../services/proactive-outreach.service';
export declare class OutreachProcessor {
    private proactiveOutreach;
    private readonly logger;
    constructor(proactiveOutreach: ProactiveOutreachService);
    handleSendOutreach(job: Job): Promise<{
        success: boolean;
        outreachId: any;
    }>;
}
