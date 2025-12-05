import { FollowupsService } from './followups.service';
import { FollowupFilterDto, UpdateFollowupDto, RecordFollowupResponseDto } from './dto/followup.dto';
export declare class FollowupsController {
    private followupsService;
    constructor(followupsService: FollowupsService);
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
    getAnalytics(): Promise<{
        total: number;
        sent: number;
        pending: number;
        responseRate: number;
        averageRating: number;
        totalReviews: number;
        upsellConversionRate: number;
    }>;
    getBookingFollowups(bookingId: string): Promise<{
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
    getUpcomingFollowups(limit?: string): Promise<({
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
    getFollowup(id: string): Promise<{
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
    sendFollowup(id: string): Promise<{
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
    recordResponse(id: string, response: RecordFollowupResponseDto): Promise<{
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
    cancelFollowup(id: string): Promise<{
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
}
