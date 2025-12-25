import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { ExternalServicesHealthIndicator } from './indicators/external-services.health';
import { CustomDiskHealthIndicator } from './indicators/disk.health';

@Controller('health')
@SkipThrottle() // Health checks should not be rate limited
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private customDisk: CustomDiskHealthIndicator,
    private database: DatabaseHealthIndicator,
    private redis: RedisHealthIndicator,
    private externalServices: ExternalServicesHealthIndicator,
  ) {}

  /**
   * Basic health check endpoint
   * Returns simple OK status
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  /**
   * Detailed health check endpoint
   * Returns comprehensive system status
   */
  @Get('detailed')
  @HealthCheck()
  detailed() {
    return this.health.check([
      // Critical checks
      () => this.database.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
      () => this.externalServices.checkWhatsApp('whatsapp'),
      () => this.externalServices.checkOpenAI('openai'),
      
      // Memory checks
      () => this.memory.checkHeap('memory_heap', 1500 * 1024 * 1024), // 1.5GB
      () => this.memory.checkRSS('memory_rss', 3000 * 1024 * 1024), // 3GB
      
      // Disk check - uses custom indicator that always returns "up" (non-critical)
      () => this.customDisk.checkStorage('storage', { 
        path: process.platform === 'win32' ? process.cwd().split('\\')[0] + '\\' : '/', 
        thresholdPercent: 0.9 // 90% threshold (warning only, won't fail check)
      }),
      
      // External Services
      () => this.externalServices.checkGoogleCalendar('google_calendar'),
    ]);
  }

  /**
   * Database health check only
   */
  @Get('database')
  @HealthCheck()
  checkDatabase() {
    return this.health.check([
      () => this.database.isHealthy('database'),
    ]);
  }

  /**
   * Redis health check only
   */
  @Get('redis')
  @HealthCheck()
  checkRedis() {
    return this.health.check([
      () => this.redis.isHealthy('redis'),
    ]);
  }

  /**
   * External services health check
   */
  @Get('external')
  @HealthCheck()
  checkExternal() {
    return this.health.check([
      () => this.externalServices.checkWhatsApp('whatsapp'),
      () => this.externalServices.checkOpenAI('openai'),
      () => this.externalServices.checkGoogleCalendar('google_calendar'),
    ]);
  }

  /**
   * System resources health check
   */
  @Get('system')
  @HealthCheck()
  checkSystem() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 1500 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 3000 * 1024 * 1024),
      () => this.customDisk.checkStorage('storage', { 
        path: process.platform === 'win32' ? process.cwd().split('\\')[0] + '\\' : '/', 
        thresholdPercent: 0.9 // 90% threshold (warning only, won't fail check)
      }),
    ]);
  }
}



