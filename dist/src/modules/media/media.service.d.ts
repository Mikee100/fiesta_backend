import { PrismaService } from '../../prisma/prisma.service';
export declare class MediaService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getCategories(): Promise<string[]>;
    getByCategory(category: string, limit?: number): Promise<{
        id: string;
        category: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        title: string | null;
        subcategory: string | null;
        url: string;
        mediaType: string;
        source: string;
    }[]>;
    getBackdrops(limit?: number): Promise<{
        id: string;
        category: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        title: string | null;
        subcategory: string | null;
        url: string;
        mediaType: string;
        source: string;
    }[]>;
}
