import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiSettingsService } from './ai-settings.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { AdminAiController } from './admin-ai.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MessagesModule } from '../messages/messages.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';

// Learning AI Services
import { CustomerMemoryService } from './services/customer-memory.service';
import { ConversationLearningService } from './services/conversation-learning.service';
import { DomainExpertiseService } from './services/domain-expertise.service';
import { AdvancedIntentService } from './services/advanced-intent.service';
import { PersonalizationService } from './services/personalization.service';
import { FeedbackLoopService } from './services/feedback-loop.service';
import { PredictiveAnalyticsService } from './services/predictive-analytics.service';

// Proactive Intelligence
import { ProactiveOutreachService } from './services/proactive-outreach.service';
import { OutreachProcessor } from './processors/outreach.processor';
import { OutreachScheduler } from './schedulers/outreach.scheduler';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    forwardRef(() => BookingsModule),
    forwardRef(() => MessagesModule),
    CustomersModule,
    BullModule.registerQueue({
      name: 'aiQueue',
    }),
    BullModule.registerQueue({
      name: 'outreachQueue',
    }),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [AiController, AdminAiController],
  providers: [
    AiService,
    AiSettingsService,
    CircuitBreakerService,
    // Learning AI Services
    CustomerMemoryService,
    ConversationLearningService,
    DomainExpertiseService,
    AdvancedIntentService,
    PersonalizationService,
    FeedbackLoopService,
    PredictiveAnalyticsService,
    // Proactive Intelligence
    ProactiveOutreachService,
    OutreachProcessor,
    OutreachScheduler,
  ],
  exports: [
    AiService,
    AiSettingsService,
    // Export learning services
    CustomerMemoryService,
    ConversationLearningService,
    DomainExpertiseService,
    AdvancedIntentService,
    PersonalizationService,
    FeedbackLoopService,
    PredictiveAnalyticsService,
    // Export proactive services
    ProactiveOutreachService,
  ],
})
export class AiModule { }
