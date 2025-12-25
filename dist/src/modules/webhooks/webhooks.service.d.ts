import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
import { AiService } from '../ai/ai.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { Queue } from 'bull';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { InstagramService } from '../instagram/instagram.service';
import { MessengerSendService } from './messenger-send.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class WebhooksService {
    private messagesService;
    private customersService;
    private aiService;
    private aiSettingsService;
    private bookingsService;
    private paymentsService;
    private whatsappService;
    private instagramService;
    private messengerSendService;
    private messageQueue;
    private aiQueue;
    private websocketGateway;
    private notificationsService?;
    constructor(messagesService: MessagesService, customersService: CustomersService, aiService: AiService, aiSettingsService: AiSettingsService, bookingsService: BookingsService, paymentsService: PaymentsService, whatsappService: WhatsappService, instagramService: InstagramService, messengerSendService: MessengerSendService, messageQueue: Queue, aiQueue: Queue, websocketGateway: WebsocketGateway, notificationsService?: NotificationsService);
    handleWhatsAppWebhook(body: any): Promise<{
        status: string;
    }>;
    processWhatsAppMessage(value: any): Promise<void>;
    handleInstagramWebhook(data: any): Promise<void>;
    verifyInstagramWebhook(mode: string, challenge: string, token: string): Promise<string>;
    handleMessengerWebhook(data: any): Promise<{
        status: string;
    }>;
    testQueueConnection(body: {
        customerId: string;
        message: string;
        platform: string;
    }): Promise<{
        success: boolean;
        error: string;
        jobId?: undefined;
        redisStatus?: undefined;
        message?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        jobId: import("bull").JobId;
        redisStatus: string;
        message: string;
        error?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        error: string;
        stack: string;
        jobId?: undefined;
        redisStatus?: undefined;
        message?: undefined;
    }>;
    handleTelegramWebhook(data: any): Promise<void>;
}
