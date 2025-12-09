import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CronModule } from './modules/cron/cron.module';
import { CustomersModule } from './modules/customers/customers.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AiModule } from './modules/ai/ai.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { InstagramModule } from './modules/instagram/instagram.module';
import { WorkersModule } from './workers/workers.module';
import { WebsocketModule } from './websockets/websocket.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { ContentScraperModule } from './modules/content-scraper/content-scraper.module';
import { PackagesModule } from './modules/packages/packages.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { FollowupsModule } from './modules/followups/followups.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { SeedingModule } from './modules/seeding/seeding.module';
import { StatisticsModule } from './modules/statistics/statistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    BookingsModule,
    CustomersModule,
    MessagesModule,
    AiModule,
    WebhooksModule,
    CalendarModule,
    CronModule,
    WhatsappModule,
    InstagramModule,
    WorkersModule,
    WebsocketModule,
    AnalyticsModule,
    PaymentsModule,
    EscalationModule,
    NotificationsModule,
    KnowledgeBaseModule,
    ContentScraperModule,
    PackagesModule,
    RemindersModule,
    FollowupsModule,
    InvoicesModule,
    ConversationsModule,
    SeedingModule,
    StatisticsModule,
  ],
  controllers: [AppController],
})
export class AppModule { }

