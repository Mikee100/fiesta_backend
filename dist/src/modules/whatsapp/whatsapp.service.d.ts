import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
export declare class WhatsappService {
    private configService;
    private messagesService;
    private customersService;
    private messageQueue;
    private phoneNumberId;
    private accessToken;
    constructor(configService: ConfigService, messagesService: MessagesService, customersService: CustomersService, messageQueue: Queue);
    verifyWebhook(mode: string, challenge: string, token: string): string;
    handleWebhook(body: any): Promise<{
        status: string;
    }>;
    processMessage(value: any): Promise<void>;
    sendMessage(to: string, message: string): Promise<any>;
    sendImage(to: string, imageUrl: string, caption?: string): Promise<any>;
    sendDocument(to: string, filePath: string, filename: string, caption?: string): Promise<any>;
    getMessages(customerId?: string): Promise<{
        messages: {
            id: string;
            from: string;
            to: string;
            content: string;
            timestamp: string;
            direction: string;
            customerId: string;
            customerName: string;
        }[];
        total: number;
    }>;
    getConversations(): Promise<{
        conversations: unknown[];
        total: number;
    }>;
    getSettings(): Promise<{
        phoneNumberId: string;
        accessToken: string;
        verifyToken: any;
        webhookUrl: any;
    }>;
    updateSettings(settings: any): Promise<{
        success: boolean;
    }>;
    testConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
    getWhatsAppStats(): Promise<{
        totalMessages: number;
        inboundMessages: number;
        outboundMessages: number;
        totalConversations: number;
        activeConversations: number;
    }>;
}
