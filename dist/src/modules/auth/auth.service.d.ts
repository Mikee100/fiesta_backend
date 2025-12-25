import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
export declare class AuthService {
    private jwtService;
    private prisma;
    constructor(jwtService: JwtService, prisma: PrismaService);
    login(email: string, password: string): Promise<{
        access_token: string;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
        };
    }>;
    validateUser(payload: any): Promise<{
        id: string;
        name: string;
        email: string;
        isActive: boolean;
        role: string;
    }>;
    createUser(email: string, password: string, name: string, role?: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string;
        role: string;
    }>;
}
