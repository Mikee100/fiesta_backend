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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const analytics_service_1 = require("./analytics.service");
let AnalyticsController = class AnalyticsController {
    constructor(analyticsService) {
        this.analyticsService = analyticsService;
    }
    whatsappSentimentTrend() {
        return this.analyticsService.whatsappSentimentTrend();
    }
    whatsappSentiment() {
        return this.analyticsService.whatsappSentimentAnalytics();
    }
    totalWhatsAppCustomers() {
        return this.analyticsService.totalWhatsAppCustomers();
    }
    newWhatsAppCustomersPerDay() {
        return this.analyticsService.newWhatsAppCustomersPerDay();
    }
    returningCustomers() {
        return this.analyticsService.returningCustomers();
    }
    aiEnabledVsDisabled() {
        return this.analyticsService.aiEnabledVsDisabled();
    }
    customersWithBooking() {
        return this.analyticsService.customersWithBooking();
    }
    totalInboundWhatsAppMessages() {
        return this.analyticsService.totalInboundWhatsAppMessages();
    }
    totalOutboundWhatsAppMessages() {
        return this.analyticsService.totalOutboundWhatsAppMessages();
    }
    peakChatHours() {
        return this.analyticsService.peakChatHours();
    }
    peakChatDays() {
        return this.analyticsService.peakChatDays();
    }
    whatsappBookingConversionRate() {
        return this.analyticsService.whatsappBookingConversionRate();
    }
    bookingStatusCounts() {
        return this.analyticsService.bookingStatusCounts();
    }
    aiDisabledFrequency() {
        return this.analyticsService.aiDisabledFrequency();
    }
    depositRevenue() {
        return this.analyticsService.depositRevenue();
    }
    whatsappSentimentByTopic() {
        return this.analyticsService.whatsappSentimentByTopic();
    }
    whatsappMostExtremeMessages() {
        return this.analyticsService.whatsappMostExtremeMessages();
    }
    whatsappKeywordTrends() {
        return this.analyticsService.whatsappKeywordTrends();
    }
    whatsappAgentAIPerformance() {
        return this.analyticsService.whatsappAgentAIPerformance();
    }
    aiPerformanceMetrics() {
        return this.analyticsService.aiPerformanceMetrics();
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('whatsapp-sentiment-trend'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappSentimentTrend", null);
__decorate([
    (0, common_1.Get)('whatsapp-sentiment'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappSentiment", null);
__decorate([
    (0, common_1.Get)('total-whatsapp-customers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "totalWhatsAppCustomers", null);
__decorate([
    (0, common_1.Get)('new-whatsapp-customers-per-day'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "newWhatsAppCustomersPerDay", null);
__decorate([
    (0, common_1.Get)('returning-customers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "returningCustomers", null);
__decorate([
    (0, common_1.Get)('ai-enabled-vs-disabled'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "aiEnabledVsDisabled", null);
__decorate([
    (0, common_1.Get)('customers-with-booking'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "customersWithBooking", null);
__decorate([
    (0, common_1.Get)('total-inbound-whatsapp-messages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "totalInboundWhatsAppMessages", null);
__decorate([
    (0, common_1.Get)('total-outbound-whatsapp-messages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "totalOutboundWhatsAppMessages", null);
__decorate([
    (0, common_1.Get)('peak-chat-hours'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "peakChatHours", null);
__decorate([
    (0, common_1.Get)('peak-chat-days'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "peakChatDays", null);
__decorate([
    (0, common_1.Get)('whatsapp-booking-conversion-rate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappBookingConversionRate", null);
__decorate([
    (0, common_1.Get)('booking-status-counts'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "bookingStatusCounts", null);
__decorate([
    (0, common_1.Get)('ai-disabled-frequency'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "aiDisabledFrequency", null);
__decorate([
    (0, common_1.Get)('deposit-revenue'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "depositRevenue", null);
__decorate([
    (0, common_1.Get)('whatsapp-sentiment-by-topic'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappSentimentByTopic", null);
__decorate([
    (0, common_1.Get)('whatsapp-most-extreme-messages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappMostExtremeMessages", null);
__decorate([
    (0, common_1.Get)('whatsapp-keyword-trends'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappKeywordTrends", null);
__decorate([
    (0, common_1.Get)('whatsapp-agent-ai-performance'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "whatsappAgentAIPerformance", null);
__decorate([
    (0, common_1.Get)('ai-performance-metrics'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "aiPerformanceMetrics", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map