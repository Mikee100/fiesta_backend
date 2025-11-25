import { AiSettingsService } from './ai-settings.service';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
export declare class AdminAiController {
    private aiSettingsService;
    private messagesService;
    private customersService;
    constructor(aiSettingsService: AiSettingsService, messagesService: MessagesService, customersService: CustomersService);
    toggleAi(enabled: boolean): Promise<{
        success: boolean;
        aiEnabled: boolean;
    }>;
    sendManualReminder(body: {
        customerId: string;
        bookingId?: string;
        message: string;
    }): Promise<{
        success: boolean;
    }>;
}
