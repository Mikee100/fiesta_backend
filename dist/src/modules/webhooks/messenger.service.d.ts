import { ConfigService } from '@nestjs/config';
import { CustomersService } from '../customers/customers.service';
import { MessagesService } from '../messages/messages.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { Queue } from 'bull';
export declare class MessengerService {
    private readonly configService;
    private readonly customersService;
    private readonly messagesService;
    private readonly websocketGateway;
    private readonly messageQueue;
    private readonly logger;
    private readonly fbVerifyToken;
    constructor(configService: ConfigService, customersService: CustomersService, messagesService: MessagesService, websocketGateway: WebsocketGateway, messageQueue: Queue);
    verifyWebhook(mode: string, token: string, challenge: string): string | null;
    handleMessage(body: any): Promise<void>;
}
