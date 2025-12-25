import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    try {
      // Set connection timeout
      const connectPromise = this.$connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 10000) // 10 second timeout
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error(`Database connection failed: ${error.message}`);
      this.logger.warn('Application will continue but database operations may fail');
      // Don't throw - allow app to start even if DB is unavailable
    }
  }

  async enableShutdownHooks(app: any) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
