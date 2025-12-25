import { MediaService } from './media.service';
export declare class MediaController {
    private readonly mediaService;
    constructor(mediaService: MediaService);
    getCategories(): Promise<string[]>;
    getByCategory(category: string, limit?: string): Promise<{
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
    getBackdrops(limit?: string): Promise<{
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
    getPortfolio(limit?: string): Promise<{
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
