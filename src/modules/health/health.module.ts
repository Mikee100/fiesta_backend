import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { ExternalServicesHealthIndicator } from './indicators/external-services.health';
import { CustomDiskHealthIndicator } from './indicators/disk.health';

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    PrismaModule,
  ],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    ExternalServicesHealthIndicator,
    CustomDiskHealthIndicator,
  ],
  exports: [DatabaseHealthIndicator, RedisHealthIndicator, ExternalServicesHealthIndicator, CustomDiskHealthIndicator],
})
export class HealthModule {}



