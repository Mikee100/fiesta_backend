import { ConfigService } from '@nestjs/config';
import { CustomersService } from '../customers/customers.service';
import { MessagesService } from '../messages/messages.service';
export declare class MessengerSendService {
    private configService;
    private customersService;
    private messagesService;
    private readonly logger;
    private pageAccessToken;
    private pageId;
    constructor(configService: ConfigService, customersService: CustomersService, messagesService: MessagesService);
    canSendMessage(messengerId: string): Promise<{
        allowed: boolean;
        reason?: string;
        lastMessageAt?: Date;
        hoursRemaining?: number;
    }>;
    sendMessage(recipientId: string, message: string): Promise<any>;
    testConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
}
