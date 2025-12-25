import { PrismaService } from '../../prisma/prisma.service';
export declare class MediaService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getCategories(): Promise<string[]>;
    getByCategory(category: string, limit?: number): Promise<{
        id: string;
        url: string;
        title: string | null;
        description: string | null;
        category: string;
        subcategory: string | null;
        mediaType: string;
        source: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getBackdrops(limit?: number): Promise<{
        id: string;
        url: string;
        title: string | null;
        description: string | null;
        category: string;
        subcategory: string | null;
        mediaType: string;
        source: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
}
