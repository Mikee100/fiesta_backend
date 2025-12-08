import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
export declare class BookingsController {
    private readonly bookingsService;
    constructor(bookingsService: BookingsService);
    getBookingStatus(customerId: string): Promise<{
        status: string;
        booking: {
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
    } | {
        status: string;
        booking?: undefined;
    }>;
    create(createBookingDto: CreateBookingDto): Promise<{
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
    }>;
    findAll(): Promise<{
        bookings: ({
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
            updatedAt: Date;
            customerId: string;
            service: string;
            dateTime: Date;
            status: string;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
        })[];
        total: number;
    }>;
    getPackages(): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        price: number;
        deposit: number;
        duration: string;
        images: number;
        makeup: boolean;
        outfits: number;
        styling: boolean;
        photobook: boolean;
        photobookSize: string | null;
        mount: boolean;
        balloonBackdrop: boolean;
        wig: boolean;
        notes: string | null;
    }[]>;
    createPackage(data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        price: number;
        deposit: number;
        duration: string;
        images: number;
        makeup: boolean;
        outfits: number;
        styling: boolean;
        photobook: boolean;
        photobookSize: string | null;
        mount: boolean;
        balloonBackdrop: boolean;
        wig: boolean;
        notes: string | null;
    }>;
    updatePackage(id: string, data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        price: number;
        deposit: number;
        duration: string;
        images: number;
        makeup: boolean;
        outfits: number;
        styling: boolean;
        photobook: boolean;
        photobookSize: string | null;
        mount: boolean;
        balloonBackdrop: boolean;
        wig: boolean;
        notes: string | null;
    }>;
    deletePackage(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        price: number;
        deposit: number;
        duration: string;
        images: number;
        makeup: boolean;
        outfits: number;
        styling: boolean;
        photobook: boolean;
        photobookSize: string | null;
        mount: boolean;
        balloonBackdrop: boolean;
        wig: boolean;
        notes: string | null;
    }>;
    getStudioInfo(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        notes: string;
        location: string;
    }>;
    findByCustomer(customerId: string): Promise<{
        bookings: ({
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
            updatedAt: Date;
            customerId: string;
            service: string;
            dateTime: Date;
            status: string;
            durationMinutes: number | null;
            recipientName: string | null;
            recipientPhone: string | null;
            googleEventId: string | null;
        })[];
        total: number;
    }>;
    confirm(id: string): Promise<{
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
        updatedAt: Date;
        customerId: string;
        service: string;
        dateTime: Date;
        status: string;
        durationMinutes: number | null;
        recipientName: string | null;
        recipientPhone: string | null;
        googleEventId: string | null;
    }>;
    cancel(id: string): Promise<{
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
        updatedAt: Date;
        customerId: string;
        service: string;
        dateTime: Date;
        status: string;
        durationMinutes: number | null;
        recipientName: string | null;
        recipientPhone: string | null;
        googleEventId: string | null;
    }>;
    completeDraft(customerId: string): Promise<{
        message: string;
        depositAmount: number;
        packageName: string;
        checkoutRequestId: string;
        paymentId: string;
    }>;
    getAvailableHours(date: string, service?: string): Promise<{
        time: any;
        available: boolean;
    }[]>;
    updateDraft(customerId: string, updates: any): Promise<{
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
    }>;
}
