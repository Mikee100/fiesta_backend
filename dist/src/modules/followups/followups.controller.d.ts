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
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    phone: string | null;
                    email: string | null;
                    whatsappId: string | null;
                    instagramId: string | null;
                    messengerId: string | null;
                    aiEnabled: boolean;
                    isAiPaused: boolean;
                    lastInstagramMessageAt: Date | null;
                    dailyTokenUsage: number;
                    tokenResetDate: Date | null;
                    totalTokensUsed: number;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                customerId: string;
                service: string;
                recipientName: string | null;
                recipientPhone: string | null;
                status: string;
                dateTime: Date;
                durationMinutes: number | null;
                googleEventId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            status: string;
            type: string;
            bookingId: string;
            sentAt: Date | null;
            scheduledFor: Date;
            messageContent: string | null;
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
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    phone: string | null;
                    email: string | null;
                    whatsappId: string | null;
                    instagramId: string | null;
                    messengerId: string | null;
                    aiEnabled: boolean;
                    isAiPaused: boolean;
                    lastInstagramMessageAt: Date | null;
                    dailyTokenUsage: number;
                    tokenResetDate: Date | null;
                    totalTokensUsed: number;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                customerId: string;
                service: string;
                recipientName: string | null;
                recipientPhone: string | null;
                status: string;
                dateTime: Date;
                durationMinutes: number | null;
                googleEventId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            status: string;
            type: string;
            bookingId: string;
            sentAt: Date | null;
            scheduledFor: Date;
            messageContent: string | null;
        })[];
        total: number;
    }>;
    getUpcomingFollowups(limit?: string): Promise<({
        booking: {
            customer: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                phone: string | null;
                email: string | null;
                whatsappId: string | null;
                instagramId: string | null;
                messengerId: string | null;
                aiEnabled: boolean;
                isAiPaused: boolean;
                lastInstagramMessageAt: Date | null;
                dailyTokenUsage: number;
                tokenResetDate: Date | null;
                totalTokensUsed: number;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    })[]>;
    getFollowup(id: string): Promise<{
        booking: {
            customer: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                phone: string | null;
                email: string | null;
                whatsappId: string | null;
                instagramId: string | null;
                messengerId: string | null;
                aiEnabled: boolean;
                isAiPaused: boolean;
                lastInstagramMessageAt: Date | null;
                dailyTokenUsage: number;
                tokenResetDate: Date | null;
                totalTokensUsed: number;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    sendFollowup(id: string): Promise<{
        booking: {
            customer: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                phone: string | null;
                email: string | null;
                whatsappId: string | null;
                instagramId: string | null;
                messengerId: string | null;
                aiEnabled: boolean;
                isAiPaused: boolean;
                lastInstagramMessageAt: Date | null;
                dailyTokenUsage: number;
                tokenResetDate: Date | null;
                totalTokensUsed: number;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    recordResponse(id: string, response: RecordFollowupResponseDto): Promise<{
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    updateFollowup(id: string, data: UpdateFollowupDto): Promise<{
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    cancelFollowup(id: string): Promise<{
        id: string;
        createdAt: Date;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
}
