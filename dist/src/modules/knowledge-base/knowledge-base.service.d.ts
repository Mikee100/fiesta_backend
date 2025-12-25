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
        category: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
    findAll(params?: {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        items: {
            id: string;
            category: string;
            createdAt: Date;
            updatedAt: Date;
            question: string;
            answer: string;
            embedding: number[];
            mediaUrls: string[];
        }[];
        total: number;
    }>;
    findOne(id: string): Promise<{
        id: string;
        category: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
    update(id: string, data: Partial<{
        question: string;
        answer: string;
        category: string;
    }>): Promise<{
        id: string;
        category: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
    remove(id: string): Promise<{
        id: string;
        category: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
}
