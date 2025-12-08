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
    }>;
    static classifyIntentSimple(content: string): string;
    constructor(prisma: PrismaService, messageQueue: Queue, aiService: AiService);
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
    countMessages(args: any): Promise<number>;
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
    findOne(id: string): Promise<{
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
    }>;
    findByExternalId(externalId: string): Promise<{
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
    }>;
    classifyIntent(content: string, history?: string[]): Promise<string>;
    sendOutboundMessage(customerId: string, content: string, platform: string): Promise<{
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
                createdAt: Date;
                updatedAt: Date;
                customerId: string;
                service: string;
                dateTime: Date;
                status: string;
                durationMinutes: number | null;
                recipientName: string | null;
                recipientPhone: string | null;
                googleEventId: string | null;
            }[];
            isReturning: boolean;
        };
        bookingDraft: {
            id: string;
            name: string | null;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string | null;
            recipientName: string | null;
            recipientPhone: string | null;
            date: string | null;
            time: string | null;
            dateTimeIso: string | null;
            isForSomeoneElse: boolean | null;
            step: string;
            conflictResolution: string | null;
            bookingId: string | null;
            version: number;
        };
    }>;
}
