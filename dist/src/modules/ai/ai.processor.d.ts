import { Job } from 'bull';
import { AiService } from './ai.service';
import { MessagesService } from '../messages/messages.service';
export declare class AiProcessor {
    private aiService;
    private messagesService;
    constructor(aiService: AiService, messagesService: MessagesService);
    handleReminder(job: Job): Promise<boolean>;
}
