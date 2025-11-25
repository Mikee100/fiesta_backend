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
        createdAt: Date;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
    }>;
    findAll(params?: {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        items: {
            id: string;
            createdAt: Date;
            question: string;
            answer: string;
            category: string;
            embedding: number[];
        }[];
        total: number;
    }>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
    }>;
    update(id: string, data: Partial<{
        question: string;
        answer: string;
        category: string;
    }>): Promise<{
        id: string;
        createdAt: Date;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        question: string;
        answer: string;
        category: string;
        embedding: number[];
    }>;
}
