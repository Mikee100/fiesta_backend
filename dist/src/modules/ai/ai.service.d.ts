import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
type HistoryMsg = {
    role: 'user' | 'assistant';
    content: string;
};
export declare class AiService {
    private configService;
    private prisma;
    private bookingsService;
    private aiQueue;
    private readonly logger;
    private openai;
    private pinecone;
    private index;
    private readonly embeddingModel;
    private readonly extractorModel;
    private readonly chatModel;
    private readonly studioTz;
    private readonly historyLimit;
    private readonly businessLocation;
    constructor(configService: ConfigService, prisma: PrismaService, bookingsService: BookingsService, aiQueue: Queue);
    private initPineconeSafely;
    private normalizeDateTime;
    generateEmbedding(text: string): Promise<number[]>;
    retrieveRelevantDocs(query: string, topK?: number): Promise<any>;
    answerFaq(question: string, history?: HistoryMsg[], actual?: string, customerId?: string): Promise<string>;
    extractBookingDetails(message: string, history?: HistoryMsg[]): Promise<{
        service?: string;
        date?: string;
        time?: string;
        name?: string;
        recipientName?: string;
        recipientPhone?: string;
        isForSomeoneElse?: boolean;
        subIntent: 'start' | 'provide' | 'confirm' | 'cancel' | 'unknown';
    }>;
    private generateBookingReply;
    getOrCreateDraft(customerId: string): Promise<{
        id: string;
        createdAt: Date;
        customerId: string;
        name: string | null;
        updatedAt: Date;
        service: string | null;
        date: string | null;
        time: string | null;
        dateTimeIso: string | null;
        recipientName: string | null;
        recipientPhone: string | null;
        isForSomeoneElse: boolean | null;
        step: string;
        version: number;
    }>;
    mergeIntoDraft(customerId: string, extraction: any): Promise<{
        id: string;
        createdAt: Date;
        customerId: string;
        name: string | null;
        updatedAt: Date;
        service: string | null;
        date: string | null;
        time: string | null;
        dateTimeIso: string | null;
        recipientName: string | null;
        recipientPhone: string | null;
        isForSomeoneElse: boolean | null;
        step: string;
        version: number;
    }>;
    checkAndCompleteIfConfirmed(draft: any, extraction: any, customerId: string, bookingsService: any): Promise<{
        action: string;
        error: string;
        suggestions?: undefined;
        message?: undefined;
        missing?: undefined;
    } | {
        action: string;
        suggestions: any;
        error?: undefined;
        message?: undefined;
        missing?: undefined;
    } | {
        action: string;
        message: any;
        error?: undefined;
        suggestions?: undefined;
        missing?: undefined;
    } | {
        action: string;
        missing: any[];
        error?: undefined;
        suggestions?: undefined;
        message?: undefined;
    }>;
    handleConversation(message: string, customerId: string, history?: HistoryMsg[], bookingsService?: any): Promise<{
        response: any;
        draft: {
            id: string;
            createdAt: Date;
            customerId: string;
            name: string | null;
            updatedAt: Date;
            service: string | null;
            date: string | null;
            time: string | null;
            dateTimeIso: string | null;
            recipientName: string | null;
            recipientPhone: string | null;
            isForSomeoneElse: boolean | null;
            step: string;
            version: number;
        };
        updatedHistory: {
            role: string;
            content: any;
        }[];
    }>;
    addKnowledge(question: string, answer: string): Promise<void>;
    processAiRequest(data: {
        question: string;
    }): Promise<string>;
    generateResponse(message: string, customerId: string, bookingsService: any, history?: any[], extractedBooking?: any, faqContext?: string): Promise<string>;
    extractStepBasedBookingDetails(message: string, currentStep: string, history?: any[]): Promise<any>;
    generateStepBasedBookingResponse(message: string, customerId: string, bookingsService: any, history: any[], draft: any, bookingResult: any): Promise<string>;
    generateGeneralResponse(message: string, customerId: string, bookingsService: any, history?: any[]): Promise<string>;
}
export {};
