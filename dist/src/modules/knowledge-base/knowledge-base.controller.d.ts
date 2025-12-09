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
        question: string;
        answer: string;
        category: string;
        embedding: number[];
        mediaUrls: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    findAll(category?: string, search?: string): Promise<{
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
    update(id: string, updateDto: Partial<{
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
