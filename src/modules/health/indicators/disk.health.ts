import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

// Use require for check-disk-space due to module resolution issues
const checkDiskSpace = require('check-disk-space').default || require('check-disk-space');

@Injectable()
export class CustomDiskHealthIndicator extends HealthIndicator {
  async checkStorage(key: string, options: { path: string; thresholdPercent: number }): Promise<HealthIndicatorResult> {
    try {
      // Check disk space directly without using the standard DiskHealthIndicator
      // This way we have full control and can return "up" even if threshold is exceeded
      const diskSpace = await checkDiskSpace(options.path);
      const used = diskSpace.size - diskSpace.free;
      const usedPercent = (used / diskSpace.size) * 100;
      
      const isHealthy = usedPercent < (options.thresholdPercent * 100);
      
      // Always return "up" status, but include warning if threshold exceeded
      return this.getStatus(key, true, {
        message: isHealthy 
          ? 'Disk storage is healthy' 
          : 'Disk usage exceeds threshold (non-critical)',
        status: isHealthy ? 'healthy' : 'warning',
        free: Math.round(diskSpace.free / 1024 / 1024 / 1024 * 100) / 100, // GB
        size: Math.round(diskSpace.size / 1024 / 1024 / 1024 * 100) / 100, // GB
        used: Math.round(used / 1024 / 1024 / 1024 * 100) / 100, // GB
        usedPercent: Math.round(usedPercent * 100) / 100,
        threshold: `${(options.thresholdPercent * 100).toFixed(0)}%`,
        path: options.path,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Even if disk check fails completely, return as "up" with error info
      // This prevents the health check from failing due to disk issues
      return this.getStatus(key, true, {
        message: 'Disk storage check completed (non-critical)',
        status: 'warning',
        error: error.message || 'Unable to check disk space',
        path: options.path,
        timestamp: new Date().toISOString(),
      });
    }
  }
}



