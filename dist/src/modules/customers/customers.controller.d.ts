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
        whatsappId: string | null;
        instagramId: string | null;
        messengerId: string | null;
        phone: string | null;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
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
    update(id: string, updateCustomerDto: Partial<CreateCustomerDto>): Promise<{
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
    toggleAi(id: string, enabled: boolean): Promise<{
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
