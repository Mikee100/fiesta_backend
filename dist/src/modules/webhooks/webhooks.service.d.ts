import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
import { AiService } from '../ai/ai.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { Queue } from 'bull';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
export declare class WebhooksService {
    private messagesService;
    private customersService;
    private aiService;
    private aiSettingsService;
    private bookingsService;
    private paymentsService;
    private whatsappService;
    private messageQueue;
    private websocketGateway;
    constructor(messagesService: MessagesService, customersService: CustomersService, aiService: AiService, aiSettingsService: AiSettingsService, bookingsService: BookingsService, paymentsService: PaymentsService, whatsappService: WhatsappService, messageQueue: Queue, websocketGateway: WebsocketGateway);
    handleWhatsAppWebhook(body: any): Promise<{
        status: string;
    }>;
    processWhatsAppMessage(value: any): Promise<void>;
    handleInstagramWebhook(data: any): Promise<void>;
    verifyInstagramWebhook(mode: string, challenge: string, token: string): Promise<string>;
    handleMessengerWebhook(data: any): Promise<void>;
    handleTelegramWebhook(data: any): Promise<void>;
}
