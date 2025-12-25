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
        bookingId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    getFollowups(filters: FollowupFilterDto): Promise<{
        followups: ({
            booking: {
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
                service: string;
                recipientName: string | null;
                recipientPhone: string | null;
                createdAt: Date;
                updatedAt: Date;
                status: string;
                dateTime: Date;
                durationMinutes: number | null;
                googleEventId: string | null;
            };
        } & {
            id: string;
            bookingId: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            type: string;
            sentAt: Date | null;
            scheduledFor: Date;
            messageContent: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        total: number;
    }>;
    getFollowupById(id: string): Promise<{
        booking: {
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
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        bookingId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    updateFollowup(id: string, data: UpdateFollowupDto): Promise<{
        id: string;
        bookingId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    cancelFollowupsForBooking(bookingId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    sendFollowup(followupId: string): Promise<{
        booking: {
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
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        bookingId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    recordResponse(followupId: string, response: RecordFollowupResponseDto): Promise<{
        id: string;
        bookingId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
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
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        bookingId: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        type: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    })[]>;
}
