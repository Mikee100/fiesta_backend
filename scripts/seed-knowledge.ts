import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SeedingService } from '../src/modules/seeding/seeding.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('SeedKnowledge');
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const seedingService = app.get(SeedingService);
    
    logger.log('Starting knowledge base seeding...');
    await seedingService.seedKnowledgeBase();
    logger.log('Knowledge base seeding completed successfully!');
    
    await app.close();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to seed knowledge base', error);
    process.exit(1);
  }
}

bootstrap();

