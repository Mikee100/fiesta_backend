import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: { question: string; answer: string; category: string }) {
    return this.prisma.knowledgeBase.create({
      data: {
        question: data.question,
        answer: data.answer,
        category: data.category,
        embedding: [], // TODO: generate embedding
      },
    });
  }

  async findAll(params?: { category?: string; search?: string; page?: number; limit?: number }) {
    const { category, search, page = 1, limit = 10 } = params || {};
    const skip = (page - 1) * limit;

    const where: any = {};
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

  async findOne(id: string) {
    return this.prisma.knowledgeBase.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: Partial<{ question: string; answer: string; category: string }>) {
    return this.prisma.knowledgeBase.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.knowledgeBase.delete({
      where: { id },
    });
  }
}
