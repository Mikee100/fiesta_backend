import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
export declare class BookingsController {
    private readonly bookingsService;
    constructor(bookingsService: BookingsService);
    create(createBookingDto: CreateBookingDto): Promise<{
        id: string;
        createdAt: Date;
        customerId: string;
        updatedAt: Date;
        service: string;
        recipientName: string | null;
        recipientPhone: string | null;
        status: string;
        dateTime: Date;
        durationMinutes: number | null;
        googleEventId: string | null;
    }>;
    findAll(): Promise<{
        bookings: ({
            customer: {
                id: string;
                createdAt: Date;
                name: string;
                email: string | null;
                whatsappId: string | null;
                instagramId: string | null;
                messengerId: string | null;
                phone: string | null;
                aiEnabled: boolean;
                updatedAt: Date;
            };
        } & {
            id: string;
            createdAt: Date;
            customerId: string;
            updatedAt: Date;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        })[];
        total: number;
    }>;
    getPackages(): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        price: number;
        updatedAt: Date;
        type: string;
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
        createdAt: Date;
        name: string;
        price: number;
        updatedAt: Date;
        type: string;
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
        createdAt: Date;
        name: string;
        price: number;
        updatedAt: Date;
        type: string;
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
        createdAt: Date;
        name: string;
        price: number;
        updatedAt: Date;
        type: string;
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
        location: string;
        updatedAt: Date;
        notes: string;
    }>;
    findByCustomer(customerId: string): Promise<{
        bookings: ({
            customer: {
                id: string;
                createdAt: Date;
                name: string;
                email: string | null;
                whatsappId: string | null;
                instagramId: string | null;
                messengerId: string | null;
                phone: string | null;
                aiEnabled: boolean;
                updatedAt: Date;
            };
        } & {
            id: string;
            createdAt: Date;
            customerId: string;
            updatedAt: Date;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            status: string;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        })[];
        total: number;
    }>;
    confirm(id: string): Promise<{
        id: string;
        createdAt: Date;
        customerId: string;
        updatedAt: Date;
        service: string;
        recipientName: string | null;
        recipientPhone: string | null;
        status: string;
        dateTime: Date;
        durationMinutes: number | null;
        googleEventId: string | null;
    }>;
    cancel(id: string): Promise<{
        id: string;
        createdAt: Date;
        customerId: string;
        updatedAt: Date;
        service: string;
        recipientName: string | null;
        recipientPhone: string | null;
        status: string;
        dateTime: Date;
        durationMinutes: number | null;
        googleEventId: string | null;
    }>;
    completeDraft(customerId: string): Promise<{
        message: string;
    }>;
}
