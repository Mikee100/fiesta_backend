"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAiController = void 0;
const common_1 = require("@nestjs/common");
const ai_settings_service_1 = require("./ai-settings.service");
const messages_service_1 = require("../messages/messages.service");
const customers_service_1 = require("../customers/customers.service");
const conversation_learning_service_1 = require("./services/conversation-learning.service");
const feedback_loop_service_1 = require("./services/feedback-loop.service");
const predictive_analytics_service_1 = require("./services/predictive-analytics.service");
const domain_expertise_service_1 = require("./services/domain-expertise.service");
const proactive_outreach_service_1 = require("./services/proactive-outreach.service");
let AdminAiController = class AdminAiController {
    constructor(aiSettingsService, messagesService, customersService, conversationLearning, feedbackLoop, predictiveAnalytics, domainExpertise, proactiveOutreach) {
        this.aiSettingsService = aiSettingsService;
        this.messagesService = messagesService;
        this.customersService = customersService;
        this.conversationLearning = conversationLearning;
        this.feedbackLoop = feedbackLoop;
        this.predictiveAnalytics = predictiveAnalytics;
        this.domainExpertise = domainExpertise;
        this.proactiveOutreach = proactiveOutreach;
    }
    async toggleAi(enabled) {
        const result = await this.aiSettingsService.setAiEnabled(enabled);
        return { success: true, aiEnabled: result.aiEnabled };
    }
    async sendManualReminder(body) {
        const { customerId, bookingId, message } = body;
        const customer = await this.customersService.findOne(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        let platform = 'messenger';
        if (!customer.messengerId) {
            if (customer.whatsappId) {
                platform = 'whatsapp';
            }
            else if (customer.instagramId) {
                platform = 'instagram';
            }
            else {
                throw new Error('No platform ID available for customer');
            }
        }
        await this.messagesService.sendOutboundMessage(customerId, message, platform);
        return { success: true };
    }
    async getLearningInsights(days) {
        if (!this.conversationLearning)
            return { error: 'Learning AI not enabled' };
        const insights = await this.conversationLearning.getLearningInsights(days || 30);
        return { success: true, insights };
    }
    async getImprovementReport(days) {
        if (!this.feedbackLoop)
            return { error: 'Learning AI not enabled' };
        const report = await this.feedbackLoop.generateImprovementReport(days || 7);
        return { success: true, report };
    }
    async triggerAutoImprovement() {
        if (!this.feedbackLoop)
            return { error: 'Learning AI not enabled' };
        const result = await this.feedbackLoop.autoTriggerImprovements();
        return { success: true, result };
    }
    async getAnalyticsDashboard() {
        if (!this.predictiveAnalytics)
            return { error: 'Learning AI not enabled' };
        const dashboard = await this.predictiveAnalytics.generateDashboard();
        return { success: true, dashboard };
    }
    async getLeadScore(customerId) {
        if (!this.predictiveAnalytics)
            return { error: 'Learning AI not enabled' };
        const score = await this.predictiveAnalytics.calculateLeadScore(customerId);
        return { success: true, leadScore: score };
    }
    async getChurnRisk(customerId) {
        if (!this.predictiveAnalytics)
            return { error: 'Learning AI not enabled' };
        const risk = await this.predictiveAnalytics.predictChurnRisk(customerId);
        return { success: true, churnRisk: risk };
    }
    async getUpsellOpportunities(customerId) {
        if (!this.predictiveAnalytics)
            return { error: 'Learning AI not enabled' };
        const opportunities = await this.predictiveAnalytics.identifyUpsellOpportunities(customerId);
        return { success: true, opportunities };
    }
    async seedDomainKnowledge() {
        if (!this.domainExpertise)
            return { error: 'Learning AI not enabled' };
        await this.domainExpertise.seedDomainKnowledge();
        return { success: true, message: 'Domain knowledge seeded successfully' };
    }
    async collectFeedback(body) {
        if (!this.feedbackLoop)
            return { error: 'Learning AI not enabled' };
        const feedback = await this.feedbackLoop.collectFeedback(body.predictionId, body);
        return { success: true, feedback };
    }
    async triggerAbandonedBookings() {
        if (!this.proactiveOutreach)
            return { error: 'Proactive outreach not enabled' };
        const count = await this.proactiveOutreach.detectAbandonedBookings();
        return { success: true, scheduled: count };
    }
    async triggerPostShootFollowups() {
        if (!this.proactiveOutreach)
            return { error: 'Proactive outreach not enabled' };
        const count = await this.proactiveOutreach.sendPostShootFollowup();
        return { success: true, sent: count };
    }
    async triggerReengagement() {
        if (!this.proactiveOutreach)
            return { error: 'Proactive outreach not enabled' };
        const count = await this.proactiveOutreach.reengageInactiveCustomers();
        return { success: true, reengaged: count };
    }
    async triggerMilestones() {
        if (!this.proactiveOutreach)
            return { error: 'Proactive outreach not enabled' };
        const count = await this.proactiveOutreach.celebrateMilestones();
        return { success: true, celebrated: count };
    }
    async getOutreachStats(days) {
        if (!this.proactiveOutreach)
            return { error: 'Proactive outreach not enabled' };
        const stats = await this.proactiveOutreach.getOutreachStats(days || 30);
        return { success: true, stats };
    }
    async scheduleCustomOutreach(body) {
        if (!this.proactiveOutreach)
            return { error: 'Proactive outreach not enabled' };
        const outreach = await this.proactiveOutreach.scheduleOutreach({
            customerId: body.customerId,
            type: body.type,
            messageContent: body.message,
            scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : new Date(),
        });
        return { success: true, outreach };
    }
};
exports.AdminAiController = AdminAiController;
__decorate([
    (0, common_1.Post)('toggle'),
    __param(0, (0, common_1.Body)('enabled')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Boolean]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "toggleAi", null);
__decorate([
    (0, common_1.Post)('send-reminder'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "sendManualReminder", null);
__decorate([
    (0, common_1.Get)('learning/insights'),
    __param(0, (0, common_1.Param)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getLearningInsights", null);
__decorate([
    (0, common_1.Get)('learning/improvement-report'),
    __param(0, (0, common_1.Param)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getImprovementReport", null);
__decorate([
    (0, common_1.Post)('learning/auto-improve'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "triggerAutoImprovement", null);
__decorate([
    (0, common_1.Get)('analytics/dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getAnalyticsDashboard", null);
__decorate([
    (0, common_1.Get)('analytics/lead-score/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getLeadScore", null);
__decorate([
    (0, common_1.Get)('analytics/churn-risk/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getChurnRisk", null);
__decorate([
    (0, common_1.Get)('analytics/upsell/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getUpsellOpportunities", null);
__decorate([
    (0, common_1.Post)('domain-knowledge/seed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "seedDomainKnowledge", null);
__decorate([
    (0, common_1.Post)('feedback/collect'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "collectFeedback", null);
__decorate([
    (0, common_1.Post)('outreach/trigger-abandoned'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "triggerAbandonedBookings", null);
__decorate([
    (0, common_1.Post)('outreach/trigger-post-shoot'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "triggerPostShootFollowups", null);
__decorate([
    (0, common_1.Post)('outreach/trigger-reengagement'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "triggerReengagement", null);
__decorate([
    (0, common_1.Post)('outreach/trigger-milestones'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "triggerMilestones", null);
__decorate([
    (0, common_1.Get)('outreach/stats'),
    __param(0, (0, common_1.Param)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "getOutreachStats", null);
__decorate([
    (0, common_1.Post)('outreach/schedule'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "scheduleCustomOutreach", null);
exports.AdminAiController = AdminAiController = __decorate([
    (0, common_1.Controller)('admin/ai'),
    __metadata("design:paramtypes", [ai_settings_service_1.AiSettingsService,
        messages_service_1.MessagesService,
        customers_service_1.CustomersService,
        conversation_learning_service_1.ConversationLearningService,
        feedback_loop_service_1.FeedbackLoopService,
        predictive_analytics_service_1.PredictiveAnalyticsService,
        domain_expertise_service_1.DomainExpertiseService,
        proactive_outreach_service_1.ProactiveOutreachService])
], AdminAiController);
//# sourceMappingURL=admin-ai.controller.js.map