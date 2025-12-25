import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Simple query to check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Check if we can query a simple table
      const userCount = await this.prisma.user.count();
      
      const isHealthy = true;
      const result = this.getStatus(key, isHealthy, {
        message: 'Database is healthy',
        connected: true,
        userCount,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const isHealthy = false;
      const result = this.getStatus(key, isHealthy, {
        message: 'Database connection failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      throw new HealthCheckError('Database check failed', result);
    }
  }
}



