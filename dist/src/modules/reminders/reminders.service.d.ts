import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateReminderDto, UpdateReminderDto, ReminderFilterDto } from './dto/reminder.dto';
export declare class RemindersService {
    private prisma;
    private whatsappService;
    private remindersQueue;
    private readonly logger;
    private readonly STUDIO_TZ;
    constructor(prisma: PrismaService, whatsappService: WhatsappService, remindersQueue: Queue);
    scheduleRemindersForBooking(bookingId: string): Promise<any[]>;
    createReminder(data: CreateReminderDto): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    getReminders(filters: ReminderFilterDto): Promise<{
        reminders: ({
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
            status: string;
            type: string;
            bookingId: string;
            sentAt: Date | null;
            scheduledFor: Date;
            messageContent: string | null;
        })[];
        total: number;
    }>;
    getReminderById(id: string): Promise<{
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
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    updateReminder(id: string, data: UpdateReminderDto): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    cancelRemindersForBooking(bookingId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    rescheduleRemindersForBooking(bookingId: string, newDateTime: Date): Promise<any[]>;
    sendReminder(reminderId: string): Promise<{
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
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    }>;
    private generateReminderMessage;
    getUpcomingReminders(limit?: number): Promise<({
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
        status: string;
        type: string;
        bookingId: string;
        sentAt: Date | null;
        scheduledFor: Date;
        messageContent: string | null;
    })[]>;
}
