import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('statistics')
@UseGuards(JwtAuthGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('active-users')
  getActiveUsers() {
    return this.statisticsService.getActiveUsers();
  }

  @Get('engaged-customers')
  getEngagedCustomers() {
    return this.statisticsService.getEngagedCustomers();
  }

  @Get('package-popularity')
  getPackagePopularity() {
    return this.statisticsService.getPackagePopularity();
  }

  /* ========================================
   * CUSTOMER EMOTIONS & SENTIMENT ENDPOINTS
   * ======================================== */

  @Get('customer-emotions')
  async getCustomerEmotions(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.statisticsService.getCustomerEmotionsStats(start, end);
  }

  @Get('emotional-tones')
  async getEmotionalTones(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.statisticsService.getEmotionalToneStats(start, end);
  }

  /* ========================================
   * AI PERSONALIZED RESPONSE ENDPOINTS
   * ======================================== */

  @Get('personalized-responses')
  async getPersonalizedResponses(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.statisticsService.getPersonalizedResponseStats(start, end);
  }

  /* ========================================
   * AI PERFORMANCE ENDPOINTS
   * ======================================== */

  @Get('ai-performance')
  async getAIPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.statisticsService.getAIPerformanceStats(start, end);
  }

  /* ========================================
   * SYSTEM-WIDE STATS ENDPOINTS
   * ======================================== */

  @Get('system')
  async getSystemStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.statisticsService.getSystemStats(start, end);
  }

  /* ========================================
   * COMPREHENSIVE STATS ENDPOINT
   * ======================================== */

  @Get('comprehensive')
  async getComprehensiveStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.statisticsService.getComprehensiveStats(start, end);
  }
}
