import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AiSettingsService } from './ai-settings.service';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
import { ConversationLearningService } from './services/conversation-learning.service';
import { FeedbackLoopService } from './services/feedback-loop.service';
import { PredictiveAnalyticsService } from './services/predictive-analytics.service';
import { DomainExpertiseService } from './services/domain-expertise.service';
import { ProactiveOutreachService } from './services/proactive-outreach.service';

@Controller('admin/ai')
export class AdminAiController {
  constructor(
    private aiSettingsService: AiSettingsService,
    private messagesService: MessagesService,
    private customersService: CustomersService,
    private conversationLearning?: ConversationLearningService,
    private feedbackLoop?: FeedbackLoopService,
    private predictiveAnalytics?: PredictiveAnalyticsService,
    private domainExpertise?: DomainExpertiseService,
    private proactiveOutreach?: ProactiveOutreachService,
  ) { }

  @Post('toggle')
  async toggleAi(@Body('enabled') enabled: boolean) {
    const result = await this.aiSettingsService.setAiEnabled(enabled);
    return { success: true, aiEnabled: result.aiEnabled };
  }

  @Post('send-reminder')
  async sendManualReminder(@Body() body: { customerId: string; bookingId?: string; message: string }) {
    const { customerId, bookingId, message } = body;

    const customer = await this.customersService.findOne(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    let platform = 'messenger';
    if (!customer.messengerId) {
      if (customer.whatsappId) {
        platform = 'whatsapp';
      } else if (customer.instagramId) {
        platform = 'instagram';
      } else {
        throw new Error('No platform ID available for customer');
      }
    }

    await this.messagesService.sendOutboundMessage(customerId, message, platform);
    return { success: true };
  }

  /* LEARNING AI ENDPOINTS */

  @Get('learning/insights')
  async getLearningInsights(@Param('days') days?: number) {
    if (!this.conversationLearning) return { error: 'Learning AI not enabled' };
    const insights = await this.conversationLearning.getLearningInsights(days || 30);
    return { success: true, insights };
  }

  @Get('learning/improvement-report')
  async getImprovementReport(@Param('days') days?: number) {
    if (!this.feedbackLoop) return { error: 'Learning AI not enabled' };
    const report = await this.feedbackLoop.generateImprovementReport(days || 7);
    return { success: true, report };
  }

  @Post('learning/auto-improve')
  async triggerAutoImprovement() {
    if (!this.feedbackLoop) return { error: 'Learning AI not enabled' };
    const result = await this.feedbackLoop.autoTriggerImprovements();
    return { success: true, result };
  }

  @Get('analytics/dashboard')
  async getAnalyticsDashboard() {
    if (!this.predictiveAnalytics) return { error: 'Learning AI not enabled' };
    const dashboard = await this.predictiveAnalytics.generateDashboard();
    return { success: true, dashboard };
  }

  @Get('analytics/lead-score/:customerId')
  async getLeadScore(@Param('customerId') customerId: string) {
    if (!this.predictiveAnalytics) return { error: 'Learning AI not enabled' };
    const score = await this.predictiveAnalytics.calculateLeadScore(customerId);
    return { success: true, leadScore: score };
  }

  @Get('analytics/churn-risk/:customerId')
  async getChurnRisk(@Param('customerId') customerId: string) {
    if (!this.predictiveAnalytics) return { error: 'Learning AI not enabled' };
    const risk = await this.predictiveAnalytics.predictChurnRisk(customerId);
    return { success: true, churnRisk: risk };
  }

  @Get('analytics/upsell/:customerId')
  async getUpsellOpportunities(@Param('customerId') customerId: string) {
    if (!this.predictiveAnalytics) return { error: 'Learning AI not enabled' };
    const opportunities = await this.predictiveAnalytics.identifyUpsellOpportunities(customerId);
    return { success: true, opportunities };
  }

  @Post('domain-knowledge/seed')
  async seedDomainKnowledge() {
    if (!this.domainExpertise) return { error: 'Learning AI not enabled' };
    await this.domainExpertise.seedDomainKnowledge();
    return { success: true, message: 'Domain knowledge seeded successfully' };
  }

  @Post('feedback/collect')
  async collectFeedback(@Body() body: {
    predictionId: number;
    thumbsUp?: boolean;
    rating?: number;
    comment?: string;
    wasHelpful?: boolean;
    wasAccurate?: boolean;
    wasEmpathetic?: boolean;
  }) {
    if (!this.feedbackLoop) return { error: 'Learning AI not enabled' };
    const feedback = await this.feedbackLoop.collectFeedback(body.predictionId, body);
    return { success: true, feedback };
  }

  /* PROACTIVE OUTREACH ENDPOINTS */

  @Post('outreach/trigger-abandoned')
  async triggerAbandonedBookings() {
    if (!this.proactiveOutreach) return { error: 'Proactive outreach not enabled' };
    const count = await this.proactiveOutreach.detectAbandonedBookings();
    return { success: true, scheduled: count };
  }

  @Post('outreach/trigger-post-shoot')
  async triggerPostShootFollowups() {
    if (!this.proactiveOutreach) return { error: 'Proactive outreach not enabled' };
    const count = await this.proactiveOutreach.sendPostShootFollowup();
    return { success: true, sent: count };
  }

  @Post('outreach/trigger-reengagement')
  async triggerReengagement() {
    if (!this.proactiveOutreach) return { error: 'Proactive outreach not enabled' };
    const count = await this.proactiveOutreach.reengageInactiveCustomers();
    return { success: true, reengaged: count };
  }

  @Post('outreach/trigger-milestones')
  async triggerMilestones() {
    if (!this.proactiveOutreach) return { error: 'Proactive outreach not enabled' };
    const count = await this.proactiveOutreach.celebrateMilestones();
    return { success: true, celebrated: count };
  }

  @Get('outreach/stats')
  async getOutreachStats(@Param('days') days?: number) {
    if (!this.proactiveOutreach) return { error: 'Proactive outreach not enabled' };
    const stats = await this.proactiveOutreach.getOutreachStats(days || 30);
    return { success: true, stats };
  }

  @Post('outreach/schedule')
  async scheduleCustomOutreach(@Body() body: {
    customerId: string;
    type: string;
    message: string;
    scheduledFor?: string;
  }) {
    if (!this.proactiveOutreach) return { error: 'Proactive outreach not enabled' };

    const outreach = await this.proactiveOutreach.scheduleOutreach({
      customerId: body.customerId,
      type: body.type,
      messageContent: body.message,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : new Date(),
    });

    return { success: true, outreach };
  }
}
