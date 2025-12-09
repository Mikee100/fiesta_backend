import { PrismaService } from '../../prisma/prisma.service';
export declare class KnowledgeBaseService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(data: {
        question: string;
        answer: string;
        category: string;
    }): Promise<{
        id: string;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
        mediaUrls: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    findAll(params?: {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        items: {
            id: string;
            question: string;
            answer: string;
            category: string;
            embedding: number[];
            mediaUrls: string[];
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
    }>;
    findOne(id: string): Promise<{
        id: string;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
        mediaUrls: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, data: Partial<{
        question: string;
        answer: string;
        category: string;
    }>): Promise<{
        id: string;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
        mediaUrls: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        id: string;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
        mediaUrls: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
}
