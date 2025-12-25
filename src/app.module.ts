import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { MessengerModule } from './modules/webhooks/messenger.module';
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
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // ============================================
    // SECURITY: Rate Limiting
    // ============================================
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 3600000, // 1 hour
        limit: 1000, // 1000 requests per hour
      },
    ]),
    BullModule.forRoot({
      redis: (() => {
        // If REDIS_URL is provided, use it with connection options
        if (process.env.REDIS_URL) {
          try {
            const url = new URL(process.env.REDIS_URL);
            return {
              host: url.hostname,
              port: parseInt(url.port || '6379', 10),
              password: url.password || process.env.REDIS_PASSWORD,
              connectTimeout: 5000, // 5 second timeout
              retryStrategy: (times: number) => {
                // Keep retrying indefinitely
                return Math.min(times * 500, 3000);
              },
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
              // lazyConnect: false,
            };
          } catch (error) {
            console.warn('Invalid REDIS_URL format, falling back to default configuration');
          }
        }
        // Use individual host/port configuration
        return {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD,
          connectTimeout: 5000, // 5 second timeout
          retryStrategy: (times: number) => {
            // Keep retrying indefinitely, with a max delay of 3 seconds
            return Math.min(times * 500, 3000);
          },
          maxRetriesPerRequest: null, // Allow unlimited retries per request
          enableReadyCheck: false, // Disable ready check to prevent/fix 'not permitted' error with Bull
          // lazyConnect: false, // Default is false (connect immediately)
        };
      })(),
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
    MessengerModule,
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
    AdminModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    // ============================================
    // SECURITY: Apply rate limiting globally
    // ============================================
    // {
    //   provide: APP_GUARD,
    //   useClass: ThrottlerGuard,
    // },
  ],
})
export class AppModule { }

