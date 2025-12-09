import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { AiService } from '../ai/ai.service';
export declare class MessagesService {
    private prisma;
    private messageQueue;
    private aiService;
    getCustomerById(customerId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        email: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        isAiPaused: boolean;
        lastInstagramMessageAt: Date | null;
        lastMessengerMessageAt: Date | null;
        dailyTokenUsage: number;
        tokenResetDate: Date | null;
        totalTokensUsed: number;
    }>;
    static classifyIntentSimple(content: string): string;
    constructor(prisma: PrismaService, messageQueue: Queue, aiService: AiService);
    create(createMessageDto: CreateMessageDto): Promise<{
        id: string;
        customerId: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    }>;
    findAll(): Promise<({
        customer: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            phone: string | null;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
        };
    } & {
        id: string;
        customerId: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    })[]>;
    countMessages(args: any): Promise<number>;
    findByCustomer(customerId: string): Promise<({
        customer: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            phone: string | null;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
        };
    } & {
        id: string;
        customerId: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    })[]>;
    findOne(id: string): Promise<{
        customer: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            phone: string | null;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
        };
    } & {
        id: string;
        customerId: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    }>;
    findByExternalId(externalId: string): Promise<{
        customer: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            phone: string | null;
            email: string | null;
            whatsappId: string | null;
            instagramId: string | null;
            messengerId: string | null;
            aiEnabled: boolean;
            isAiPaused: boolean;
            lastInstagramMessageAt: Date | null;
            lastMessengerMessageAt: Date | null;
            dailyTokenUsage: number;
            tokenResetDate: Date | null;
            totalTokensUsed: number;
        };
    } & {
        id: string;
        customerId: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    }>;
    classifyIntent(content: string, history?: string[]): Promise<string>;
    sendOutboundMessage(customerId: string, content: string, platform: string): Promise<{
        id: string;
        customerId: string;
        createdAt: Date;
        content: string;
        platform: string;
        direction: string;
        externalId: string | null;
        handledBy: string | null;
        isResolved: boolean | null;
        isEscalated: boolean | null;
    }>;
    getConversationHistory(customerId: string, limit?: number): Promise<Array<{
        role: 'user' | 'assistant';
        content: string;
    }>>;
    getEnrichedContext(customerId: string): Promise<{
        history: {
            role: "user" | "assistant";
            content: string;
        }[];
        customer: {
            name: string;
            totalBookings: number;
            recentBookings: {
                id: string;
                customerId: string;
                service: string;
                recipientName: string | null;
                recipientPhone: string | null;
                createdAt: Date;
                updatedAt: Date;
                status: string;
                dateTime: Date;
                durationMinutes: number | null;
                googleEventId: string | null;
            }[];
            isReturning: boolean;
        };
        bookingDraft: {
            id: string;
            customerId: string;
            service: string;
            date: string;
            time: string;
            dateTimeIso: string;
            name: string;
            recipientName: string;
            recipientPhone: string;
            isForSomeoneElse: boolean;
            step: string;
            conflictResolution: string;
            version: number;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
}
