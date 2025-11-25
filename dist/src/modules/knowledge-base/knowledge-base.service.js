"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var KnowledgeBaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeBaseService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let KnowledgeBaseService = KnowledgeBaseService_1 = class KnowledgeBaseService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(KnowledgeBaseService_1.name);
    }
    async create(data) {
        return this.prisma.knowledgeBase.create({
            data: {
                question: data.question,
                answer: data.answer,
                category: data.category,
                embedding: [],
            },
        });
    }
    async findAll(params) {
        const { category, search, page = 1, limit = 10 } = params || {};
        const skip = (page - 1) * limit;
        const where = {};
        if (category) {
            where.category = category;
        }
        if (search) {
            where.OR = [
                { question: { contains: search, mode: 'insensitive' } },
                { answer: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [items, total] = await Promise.all([
            this.prisma.knowledgeBase.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.knowledgeBase.count({ where }),
        ]);
        return { items, total };
    }
    async findOne(id) {
        return this.prisma.knowledgeBase.findUnique({
            where: { id },
        });
    }
    async update(id, data) {
        return this.prisma.knowledgeBase.update({
            where: { id },
            data,
        });
    }
    async remove(id) {
        return this.prisma.knowledgeBase.delete({
            where: { id },
        });
    }
};
exports.KnowledgeBaseService = KnowledgeBaseService;
exports.KnowledgeBaseService = KnowledgeBaseService = KnowledgeBaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], KnowledgeBaseService);
//# sourceMappingURL=knowledge-base.service.js.map