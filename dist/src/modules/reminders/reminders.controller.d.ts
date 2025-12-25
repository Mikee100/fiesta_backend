import { RemindersService } from './reminders.service';
import { ReminderFilterDto, UpdateReminderDto } from './dto/reminder.dto';
export declare class RemindersController {
    private remindersService;
    constructor(remindersService: RemindersService);
    getReminders(filters: ReminderFilterDto): Promise<{
        reminders: ({
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
                status: string;
                createdAt: Date;
                updatedAt: Date;
                customerId: string;
                service: string;
                dateTime: Date;
                durationMinutes: number | null;
                recipientName: string | null;
                recipientPhone: string | null;
                googleEventId: string | null;
            };
        } & {
            id: string;
            type: string;
            scheduledFor: Date;
            status: string;
            messageContent: string | null;
            sentAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
            bookingId: string;
        })[];
        total: number;
    }>;
    getBookingReminders(bookingId: string): Promise<{
        reminders: ({
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
                status: string;
                createdAt: Date;
                updatedAt: Date;
                customerId: string;
                service: string;
                dateTime: Date;
                durationMinutes: number | null;
                recipientName: string | null;
                recipientPhone: string | null;
                googleEventId: string | null;
            };
        } & {
            id: string;
            type: string;
            scheduledFor: Date;
            status: string;
            messageContent: string | null;
            sentAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
            bookingId: string;
        })[];
        total: number;
    }>;
    getUpcomingReminders(limit?: string): Promise<({
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
            status: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string;
            dateTime: Date;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        type: string;
        scheduledFor: Date;
        status: string;
        messageContent: string | null;
        sentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        bookingId: string;
    })[]>;
    getReminder(id: string): Promise<{
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
            status: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string;
            dateTime: Date;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        type: string;
        scheduledFor: Date;
        status: string;
        messageContent: string | null;
        sentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        bookingId: string;
    }>;
    sendReminder(id: string): Promise<{
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
            status: string;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            service: string;
            dateTime: Date;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
        };
    } & {
        id: string;
        type: string;
        scheduledFor: Date;
        status: string;
        messageContent: string | null;
        sentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        bookingId: string;
    }>;
    updateReminder(id: string, data: UpdateReminderDto): Promise<{
        id: string;
        type: string;
        scheduledFor: Date;
        status: string;
        messageContent: string | null;
        sentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        bookingId: string;
    }>;
    cancelReminder(id: string): Promise<{
        id: string;
        type: string;
        scheduledFor: Date;
        status: string;
        messageContent: string | null;
        sentAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        bookingId: string;
    }>;
}
