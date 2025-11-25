import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
export declare class MessagesController {
    private readonly messagesService;
    constructor(messagesService: MessagesService);
    create(createMessageDto: CreateMessageDto): Promise<{
        id: string;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        createdAt: Date;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
        customerId: string;
    }>;
    findAll(): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            phone: string | null;
            aiEnabled: boolean;
            updatedAt: Date;
        };
    } & {
        id: string;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        createdAt: Date;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
        customerId: string;
    })[]>;
    findByCustomer(customerId: string): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            phone: string | null;
            aiEnabled: boolean;
            updatedAt: Date;
        };
    } & {
        id: string;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        createdAt: Date;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
        customerId: string;
    })[]>;
}
