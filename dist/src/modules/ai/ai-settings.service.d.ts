import { PrismaService } from '../../prisma/prisma.service';
export declare class AiSettingsService {
    private prisma;
    constructor(prisma: PrismaService);
    isAiEnabled(): Promise<boolean>;
    setAiEnabled(value: boolean): Promise<{
        id: number;
        aiEnabled: boolean;
        updatedAt: Date;
    }>;
}
