import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiSettingsService {
  constructor(private prisma: PrismaService) {}

  async isAiEnabled() {
    const settings = await this.prisma.aiSettings.findUnique({ where: { id: 1 } });
    return settings?.aiEnabled ?? true;
  }

  async setAiEnabled(value: boolean) {
    return this.prisma.aiSettings.update({
      where: { id: 1 },
      data: { aiEnabled: value },
    });
  }
}
