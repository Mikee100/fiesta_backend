import { KnowledgeBaseService } from './knowledge-base.service';
export declare class KnowledgeBaseController {
    private readonly knowledgeBaseService;
    constructor(knowledgeBaseService: KnowledgeBaseService);
    create(createDto: {
        question: string;
        answer: string;
        category: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        category: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
    findAll(category?: string, search?: string): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            question: string;
            category: string;
            answer: string;
            embedding: number[];
            mediaUrls: string[];
        }[];
        total: number;
    }>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        category: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
    update(id: string, updateDto: Partial<{
        question: string;
        answer: string;
        category: string;
    }>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        category: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        category: string;
        answer: string;
        embedding: number[];
        mediaUrls: string[];
    }>;
}
