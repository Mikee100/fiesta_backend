import { PrismaService } from '../../prisma/prisma.service';
export declare class CustomersService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: any): Promise<{
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
    }>;
    findByWhatsappId(whatsappId: string): Promise<{
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
    }>;
    findByInstagramId(instagramId: string): Promise<{
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
    }>;
    findByMessengerId(messengerId: string): Promise<{
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
    }>;
    findByEmail(email: string): Promise<{
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
    }>;
    findOne(id: string): Promise<{
        messages: {
            id: string;
            content: string;
            platform: string;
            direction: string;
            externalId: string | null;
            createdAt: Date;
            handledBy: string | null;
            isResolved: boolean | null;
            isEscalated: boolean | null;
            customerId: string;
        }[];
        bookings: {
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
        }[];
    } & {
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
    }>;
    findById(id: string): Promise<{
        messages: {
            id: string;
            content: string;
            platform: string;
            direction: string;
            externalId: string | null;
            createdAt: Date;
            handledBy: string | null;
            isResolved: boolean | null;
            isEscalated: boolean | null;
            customerId: string;
        }[];
        bookings: {
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
        }[];
    } & {
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
    }>;
    updatePhone(whatsappId: string, phone: string): Promise<{
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
    }>;
    toggleAiEnabled(customerId: string, enabled: boolean): Promise<{
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
    }>;
    getAll(): Promise<({
        messages: {
            id: string;
            content: string;
            platform: string;
            direction: string;
            externalId: string | null;
            createdAt: Date;
            handledBy: string | null;
            isResolved: boolean | null;
            isEscalated: boolean | null;
            customerId: string;
        }[];
        bookings: {
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
        }[];
    } & {
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
    })[]>;
    findAll(): Promise<({
        messages: {
            id: string;
            content: string;
            platform: string;
            direction: string;
            externalId: string | null;
            createdAt: Date;
            handledBy: string | null;
            isResolved: boolean | null;
            isEscalated: boolean | null;
            customerId: string;
        }[];
        bookings: {
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
        }[];
    } & {
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
    })[]>;
    update(id: string, updateCustomerDto: Partial<any>): Promise<{
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
    }>;
    remove(id: string): Promise<{
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
    }>;
    createWithMessengerId(messengerId: string): Promise<{
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
    }>;
}
