import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateFollowupDto, UpdateFollowupDto, FollowupFilterDto, RecordFollowupResponseDto } from './dto/followup.dto';
export declare class FollowupsService {
    private prisma;
    private whatsappService;
    private followupsQueue;
    private readonly logger;
    private readonly STUDIO_TZ;
    constructor(prisma: PrismaService, whatsappService: WhatsappService, followupsQueue: Queue);
    scheduleFollowupsForBooking(bookingId: string): Promise<any[]>;
    private addWorkingDays;
    createFollowup(data: CreateFollowupDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        sentAt: Date | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        scheduledFor: Date;
        messageContent: string | null;
        bookingId: string;
    }>;
    getFollowups(filters: FollowupFilterDto): Promise<{
        followups: ({
            booking: {
                customer: {
                    id: string;
                    name: string;
                    email: string | null;
                    phone: string | null;
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
                    createdAt: Date;
                    updatedAt: Date;
                };
            } & {
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
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            sentAt: Date | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            type: string;
            scheduledFor: Date;
            messageContent: string | null;
            bookingId: string;
        })[];
        total: number;
    }>;
    getFollowupById(id: string): Promise<{
        booking: {
            customer: {
                id: string;
                name: string;
                email: string | null;
                phone: string | null;
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
                createdAt: Date;
                updatedAt: Date;
            };
        } & {
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
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        sentAt: Date | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        scheduledFor: Date;
        messageContent: string | null;
        bookingId: string;
    }>;
    updateFollowup(id: string, data: UpdateFollowupDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        sentAt: Date | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        scheduledFor: Date;
        messageContent: string | null;
        bookingId: string;
    }>;
    cancelFollowupsForBooking(bookingId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    sendFollowup(followupId: string): Promise<{
        booking: {
            customer: {
                id: string;
                name: string;
                email: string | null;
                phone: string | null;
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
                createdAt: Date;
                updatedAt: Date;
            };
        } & {
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
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        sentAt: Date | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        scheduledFor: Date;
        messageContent: string | null;
        bookingId: string;
    }>;
    recordResponse(followupId: string, response: RecordFollowupResponseDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        sentAt: Date | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        scheduledFor: Date;
        messageContent: string | null;
        bookingId: string;
    }>;
    private generateFollowupMessage;
    getFollowupAnalytics(): Promise<{
        total: number;
        sent: number;
        pending: number;
        responseRate: number;
        averageRating: number;
        totalReviews: number;
        upsellConversionRate: number;
    }>;
    getUpcomingFollowups(limit?: number): Promise<({
        booking: {
            customer: {
                id: string;
                name: string;
                email: string | null;
                phone: string | null;
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
                createdAt: Date;
                updatedAt: Date;
            };
        } & {
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
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        sentAt: Date | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: string;
        scheduledFor: Date;
        messageContent: string | null;
        bookingId: string;
    })[]>;
}
