import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
export declare class MessagesController {
    private readonly messagesService;
    constructor(messagesService: MessagesService);
    create(createMessageDto: CreateMessageDto): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
        customerId: string;
    }>;
    findAll(): Promise<({
        customer: {
            id: string;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            name: string;
            phone: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
        customerId: string;
    })[]>;
    findByCustomer(customerId: string): Promise<({
        customer: {
            id: string;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            name: string;
            phone: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
        customerId: string;
    })[]>;
}
