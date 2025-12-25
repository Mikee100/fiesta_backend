import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private redisUrl: string;

  constructor(private configService: ConfigService) {
    super();
    this.redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    let client;
    try {
      // Create Redis client
      client = createClient({ url: this.redisUrl });
      await client.connect();

      // Test Redis connection with PING
      const pingResult = await client.ping();
      
      // Get Redis info
      const info = await client.info('server');
      const memoryInfo = await client.info('memory');
      
      // Test write/read
      const testKey = `health-check-${Date.now()}`;
      await client.set(testKey, 'test', { EX: 1 }); // Expires in 1 second
      const testValue = await client.get(testKey);
      await client.del(testKey);

      const isHealthy = pingResult === 'PONG' && testValue === 'test';
      
      const result = this.getStatus(key, isHealthy, {
        message: 'Redis is healthy',
        connected: true,
        ping: pingResult,
        readWriteTest: testValue === 'test',
        timestamp: new Date().toISOString(),
      });

      await client.quit();
      return result;
    } catch (error) {
      const isHealthy = false;
      const result = this.getStatus(key, isHealthy, {
        message: 'Redis connection failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      if (client) {
        try {
          await client.quit();
        } catch (e) {
          // Ignore quit errors
        }
      }

      throw new HealthCheckError('Redis check failed', result);
    }
  }
}



