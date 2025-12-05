"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const schedule_1 = require("@nestjs/schedule");
const ai_controller_1 = require("./ai.controller");
const ai_service_1 = require("./ai.service");
const ai_settings_service_1 = require("./ai-settings.service");
const circuit_breaker_service_1 = require("./services/circuit-breaker.service");
const admin_ai_controller_1 = require("./admin-ai.controller");
const prisma_module_1 = require("../../prisma/prisma.module");
const bookings_module_1 = require("../bookings/bookings.module");
const messages_module_1 = require("../messages/messages.module");
const customers_module_1 = require("../customers/customers.module");
const payments_module_1 = require("../payments/payments.module");
const customer_memory_service_1 = require("./services/customer-memory.service");
const conversation_learning_service_1 = require("./services/conversation-learning.service");
const domain_expertise_service_1 = require("./services/domain-expertise.service");
const advanced_intent_service_1 = require("./services/advanced-intent.service");
const personalization_service_1 = require("./services/personalization.service");
const feedback_loop_service_1 = require("./services/feedback-loop.service");
const predictive_analytics_service_1 = require("./services/predictive-analytics.service");
const proactive_outreach_service_1 = require("./services/proactive-outreach.service");
const outreach_processor_1 = require("./processors/outreach.processor");
const outreach_scheduler_1 = require("./schedulers/outreach.scheduler");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            schedule_1.ScheduleModule.forRoot(),
            (0, common_1.forwardRef)(() => bookings_module_1.BookingsModule),
            (0, common_1.forwardRef)(() => messages_module_1.MessagesModule),
            customers_module_1.CustomersModule,
            bull_1.BullModule.registerQueue({
                name: 'aiQueue',
            }),
            bull_1.BullModule.registerQueue({
                name: 'outreachQueue',
            }),
            (0, common_1.forwardRef)(() => payments_module_1.PaymentsModule),
        ],
        controllers: [ai_controller_1.AiController, admin_ai_controller_1.AdminAiController],
        providers: [
            ai_service_1.AiService,
            ai_settings_service_1.AiSettingsService,
            circuit_breaker_service_1.CircuitBreakerService,
            customer_memory_service_1.CustomerMemoryService,
            conversation_learning_service_1.ConversationLearningService,
            domain_expertise_service_1.DomainExpertiseService,
            advanced_intent_service_1.AdvancedIntentService,
            personalization_service_1.PersonalizationService,
            feedback_loop_service_1.FeedbackLoopService,
            predictive_analytics_service_1.PredictiveAnalyticsService,
            proactive_outreach_service_1.ProactiveOutreachService,
            outreach_processor_1.OutreachProcessor,
            outreach_scheduler_1.OutreachScheduler,
        ],
        exports: [
            ai_service_1.AiService,
            ai_settings_service_1.AiSettingsService,
            customer_memory_service_1.CustomerMemoryService,
            conversation_learning_service_1.ConversationLearningService,
            domain_expertise_service_1.DomainExpertiseService,
            advanced_intent_service_1.AdvancedIntentService,
            personalization_service_1.PersonalizationService,
            feedback_loop_service_1.FeedbackLoopService,
            predictive_analytics_service_1.PredictiveAnalyticsService,
            proactive_outreach_service_1.ProactiveOutreachService,
        ],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map