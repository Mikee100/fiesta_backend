import { ProactiveOutreachService } from '../services/proactive-outreach.service';
export declare class OutreachScheduler {
    private proactiveOutreach;
    private readonly logger;
    constructor(proactiveOutreach: ProactiveOutreachService);
    checkAbandonedBookings(): Promise<void>;
    checkPostShootFollowups(): Promise<void>;
    checkReengagement(): Promise<void>;
    checkMilestones(): Promise<void>;
    checkPregnancyMilestones(): Promise<void>;
}
