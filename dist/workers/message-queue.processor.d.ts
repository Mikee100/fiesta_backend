import { Job } from 'bull';
import { MessagesService } from '../src/modules/messages/messages.service';
import { AiService } from '../src/modules/ai/ai.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { WhatsappService } from '../src/modules/whatsapp/whatsapp.service';
import { InstagramService } from '../src/modules/instagram/instagram.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { WebsocketGateway } from '../src/websockets/websocket.gateway';
export declare class MessageQueueProcessor {
    private messagesService;
    private aiService;
    private bookingsService;
    private whatsappService;
    private customersService;
    private instagramService;
    private websocketGateway;
    private readonly logger;
    private readonly STUDIO_TZ;
    private readonly HISTORY_LIMIT;
    constructor(messagesService: MessagesService, aiService: AiService, bookingsService: BookingsService, whatsappService: WhatsappService, customersService: CustomersService, instagramService: InstagramService, websocketGateway: WebsocketGateway);
    process(job: Job<any>): Promise<any>;
    sendOutboundMessage(job: Job<{
        customerId: string;
        content: string;
        platform: string;
    }>): Promise<any>;
}
