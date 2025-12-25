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
    getUpcomingFollowups(limit?: string): Promise<({
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
    getFollowup(id: string): Promise<{
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
    sendFollowup(id: string): Promise<{
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
    recordResponse(id: string, response: RecordFollowupResponseDto): Promise<{
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
    cancelFollowup(id: string): Promise<{
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
}
