
import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('whatsapp-sentiment-trend')
  whatsappSentimentTrend() {
    return this.analyticsService.whatsappSentimentTrend();
  }

  @Get('whatsapp-sentiment')
  whatsappSentiment() {
    return this.analyticsService.whatsappSentimentAnalytics();
  }

  @Get('total-whatsapp-customers')
  totalWhatsAppCustomers() {
    return this.analyticsService.totalWhatsAppCustomers();
  }

  @Get('new-whatsapp-customers-per-day')
  newWhatsAppCustomersPerDay() {
    return this.analyticsService.newWhatsAppCustomersPerDay();
  }

  @Get('returning-customers')
  returningCustomers() {
    return this.analyticsService.returningCustomers();
  }

  @Get('ai-enabled-vs-disabled')
  aiEnabledVsDisabled() {
    return this.analyticsService.aiEnabledVsDisabled();
  }

  @Get('customers-with-booking')
  customersWithBooking() {
    return this.analyticsService.customersWithBooking();
  }

  @Get('total-inbound-whatsapp-messages')
  totalInboundWhatsAppMessages() {
    return this.analyticsService.totalInboundWhatsAppMessages();
  }

  @Get('total-outbound-whatsapp-messages')
  totalOutboundWhatsAppMessages() {
    return this.analyticsService.totalOutboundWhatsAppMessages();
  }

  @Get('peak-chat-hours')
  peakChatHours() {
    return this.analyticsService.peakChatHours();
  }

  @Get('peak-chat-days')
  peakChatDays() {
    return this.analyticsService.peakChatDays();
  }

  @Get('whatsapp-booking-conversion-rate')
  whatsappBookingConversionRate() {
    return this.analyticsService.whatsappBookingConversionRate();
  }

  @Get('booking-status-counts')
  bookingStatusCounts() {
    return this.analyticsService.bookingStatusCounts();
  }

  @Get('ai-disabled-frequency')
  aiDisabledFrequency() {
    return this.analyticsService.aiDisabledFrequency();
  }

  @Get('deposit-revenue')
  depositRevenue() {
    return this.analyticsService.depositRevenue();
  }

  @Get('whatsapp-sentiment-by-topic')
  whatsappSentimentByTopic() {
    return this.analyticsService.whatsappSentimentByTopic();
  }

  @Get('whatsapp-most-extreme-messages')
  whatsappMostExtremeMessages() {
    return this.analyticsService.whatsappMostExtremeMessages();
  }

  @Get('whatsapp-keyword-trends')
  whatsappKeywordTrends() {
    return this.analyticsService.whatsappKeywordTrends();
  }
    @Get('whatsapp-agent-ai-performance')
  whatsappAgentAIPerformance() {
    return this.analyticsService.whatsappAgentAIPerformance();
  }
   @Get('ai-performance-metrics')
  aiPerformanceMetrics() {
    return this.analyticsService.aiPerformanceMetrics();
  }
}
