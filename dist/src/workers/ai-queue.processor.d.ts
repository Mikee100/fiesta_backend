import { Job } from 'bull';
import { AiService } from '../modules/ai/ai.service';
import { MessengerSendService } from '../modules/webhooks/messenger-send.service';
import { WhatsappService } from '../modules/whatsapp/whatsapp.service';
import { InstagramService } from '../modules/instagram/instagram.service';
import { MessagesService } from '../modules/messages/messages.service';
import { CustomersService } from '../modules/customers/customers.service';
import { BookingsService } from '../modules/bookings/bookings.service';
import { WebsocketGateway } from '../websockets/websocket.gateway';
export declare class AiQueueProcessor {
    private readonly aiService;
    private readonly messengerSendService;
    private readonly whatsappService;
    private readonly instagramService;
    private readonly messagesService;
    private readonly customersService;
    private readonly bookingsService;
    private readonly websocketGateway;
    private readonly logger;
    constructor(aiService: AiService, messengerSendService: MessengerSendService, whatsappService: WhatsappService, instagramService: InstagramService, messagesService: MessagesService, customersService: CustomersService, bookingsService: BookingsService, websocketGateway: WebsocketGateway);
    handleAiJob(job: Job): Promise<void>;
    private sendResponseByPlatform;
}
