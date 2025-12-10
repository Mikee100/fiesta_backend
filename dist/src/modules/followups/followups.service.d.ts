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
        status: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        bookingId: string;
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
                    createdAt: Date;
                    updatedAt: Date;
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
                };
            } & {
                id: string;
                customerId: string;
                service: string;
                dateTime: Date;
                status: string;
                durationMinutes: number | null;
                recipientName: string | null;
                recipientPhone: string | null;
                googleEventId: string | null;
                createdAt: Date;
                updatedAt: Date;
            };
        } & {
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            bookingId: string;
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
                createdAt: Date;
                updatedAt: Date;
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
            };
        } & {
            id: string;
            customerId: string;
            service: string;
            dateTime: Date;
            status: string;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    updateFollowup(id: string, data: UpdateFollowupDto): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        bookingId: string;
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
                createdAt: Date;
                updatedAt: Date;
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
            };
        } & {
            id: string;
            customerId: string;
            service: string;
            dateTime: Date;
            status: string;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    recordResponse(followupId: string, response: RecordFollowupResponseDto): Promise<{
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        bookingId: string;
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
                createdAt: Date;
                updatedAt: Date;
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
            };
        } & {
            id: string;
            customerId: string;
            service: string;
            dateTime: Date;
            status: string;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
    })[]>;
}
