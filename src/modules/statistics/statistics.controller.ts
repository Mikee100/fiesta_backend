import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
