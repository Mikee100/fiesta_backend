import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
export declare class CustomersController {
    private readonly customersService;
    constructor(customersService: CustomersService);
    create(createCustomerDto: CreateCustomerDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string | null;
        phone: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
    findAll(): Promise<({
        messages: {
            content: string;
            platform: string;
            direction: string;
            customerId: string;
            externalId: string | null;
            id: string;
            createdAt: Date;
            handledBy: string | null;
            isResolved: boolean | null;
            isEscalated: boolean | null;
        }[];
        bookings: {
            customerId: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        email: string | null;
        phone: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    })[]>;
    findOne(id: string): Promise<{
        messages: {
            content: string;
            platform: string;
            direction: string;
            customerId: string;
            externalId: string | null;
            id: string;
            createdAt: Date;
            handledBy: string | null;
            isResolved: boolean | null;
            isEscalated: boolean | null;
        }[];
        bookings: {
            customerId: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: string;
            service: string;
            recipientName: string | null;
            recipientPhone: string | null;
            dateTime: Date;
            durationMinutes: number | null;
            googleEventId: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        email: string | null;
        phone: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
    update(id: string, updateCustomerDto: Partial<CreateCustomerDto>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string | null;
        phone: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string | null;
        phone: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
    toggleAi(id: string, enabled: boolean): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string | null;
        phone: string | null;
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
}
