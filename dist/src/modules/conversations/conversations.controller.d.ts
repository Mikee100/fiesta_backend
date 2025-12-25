import { ConversationsService } from './conversations.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { InstagramService } from '../instagram/instagram.service';
import { MessengerSendService } from '../webhooks/messenger-send.service';
export declare class ConversationsController {
    private conversationsService;
    private whatsappService;
    private instagramService;
    private messengerSendService;
    constructor(conversationsService: ConversationsService, whatsappService: WhatsappService, instagramService: InstagramService, messengerSendService: MessengerSendService);
    getAllConversations(platform?: string, limit?: string, offset?: string): Promise<{
        id: string;
        name: string;
        phone: string;
        whatsappId: string;
        instagramId: string;
        messengerId: string;
        platform: string;
        lastMessage: string;
        lastMessageAt: Date;
        lastMessageDirection: string;
        messageCount: number;
        isActive: boolean;
    }[]>;
    getConversation(id: string): Promise<{
        id: string;
        name: string;
        phone: string;
        whatsappId: string;
        instagramId: string;
        messengerId: string;
        platform: string;
        messageCount: number;
        bookingCount: number;
        lastActiveAt: Date;
        isActive: boolean;
        createdAt: Date;
    }>;
    getMessages(id: string, platform?: string): Promise<{
        id: string;
        createdAt: Date;
        platform: string;
        content: string;
        direction: string;
    }[]>;
    sendReply(id: string, body: {
        message: string;
        platform: string;
    }): Promise<{
        id: string;
        customerId: string;
        createdAt: Date;
        platform: string;
        content: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    }>;
}
