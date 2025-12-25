"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const throttler_1 = require("@nestjs/throttler");
const event_emitter_1 = require("@nestjs/event-emitter");
const app_controller_1 = require("./app.controller");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./modules/auth/auth.module");
const bookings_module_1 = require("./modules/bookings/bookings.module");
const calendar_module_1 = require("./modules/calendar/calendar.module");
const cron_module_1 = require("./modules/cron/cron.module");
const customers_module_1 = require("./modules/customers/customers.module");
const messages_module_1 = require("./modules/messages/messages.module");
const ai_module_1 = require("./modules/ai/ai.module");
const webhooks_module_1 = require("./modules/webhooks/webhooks.module");
const whatsapp_module_1 = require("./modules/whatsapp/whatsapp.module");
const instagram_module_1 = require("./modules/instagram/instagram.module");
const messenger_module_1 = require("./modules/webhooks/messenger.module");
const workers_module_1 = require("./workers/workers.module");
const websocket_module_1 = require("./websockets/websocket.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const payments_module_1 = require("./modules/payments/payments.module");
const escalation_module_1 = require("./modules/escalation/escalation.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const knowledge_base_module_1 = require("./modules/knowledge-base/knowledge-base.module");
const content_scraper_module_1 = require("./modules/content-scraper/content-scraper.module");
const packages_module_1 = require("./modules/packages/packages.module");
const reminders_module_1 = require("./modules/reminders/reminders.module");
const followups_module_1 = require("./modules/followups/followups.module");
const invoices_module_1 = require("./modules/invoices/invoices.module");
const conversations_module_1 = require("./modules/conversations/conversations.module");
const seeding_module_1 = require("./modules/seeding/seeding.module");
const statistics_module_1 = require("./modules/statistics/statistics.module");
const admin_module_1 = require("./modules/admin/admin.module");
const health_module_1 = require("./modules/health/health.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    name: 'short',
                    ttl: 1000,
                    limit: 10,
                },
                {
                    name: 'medium',
                    ttl: 60000,
                    limit: 100,
                },
                {
                    name: 'long',
                    ttl: 3600000,
                    limit: 1000,
                },
            ]),
            bull_1.BullModule.forRoot({
                redis: (() => {
                    if (process.env.REDIS_URL) {
                        try {
                            const url = new URL(process.env.REDIS_URL);
                            return {
                                host: url.hostname,
                                port: parseInt(url.port || '6379', 10),
                                password: url.password || process.env.REDIS_PASSWORD,
                                connectTimeout: 5000,
                                retryStrategy: (times) => {
                                    return Math.min(times * 500, 3000);
                                },
                                maxRetriesPerRequest: null,
                                enableReadyCheck: false,
                            };
                        }
                        catch (error) {
                            console.warn('Invalid REDIS_URL format, falling back to default configuration');
                        }
                    }
                    return {
                        host: process.env.REDIS_HOST || 'localhost',
                        port: parseInt(process.env.REDIS_PORT || '6379', 10),
                        password: process.env.REDIS_PASSWORD,
                        connectTimeout: 5000,
                        retryStrategy: (times) => {
                            return Math.min(times * 500, 3000);
                        },
                        maxRetriesPerRequest: null,
                        enableReadyCheck: false,
                    };
                })(),
            }),
            event_emitter_1.EventEmitterModule.forRoot(),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            bookings_module_1.BookingsModule,
            customers_module_1.CustomersModule,
            messages_module_1.MessagesModule,
            ai_module_1.AiModule,
            webhooks_module_1.WebhooksModule,
            calendar_module_1.CalendarModule,
            cron_module_1.CronModule,
            whatsapp_module_1.WhatsappModule,
            instagram_module_1.InstagramModule,
            messenger_module_1.MessengerModule,
            workers_module_1.WorkersModule,
            websocket_module_1.WebsocketModule,
            analytics_module_1.AnalyticsModule,
            payments_module_1.PaymentsModule,
            escalation_module_1.EscalationModule,
            notifications_module_1.NotificationsModule,
            knowledge_base_module_1.KnowledgeBaseModule,
            content_scraper_module_1.ContentScraperModule,
            packages_module_1.PackagesModule,
            reminders_module_1.RemindersModule,
            followups_module_1.FollowupsModule,
            invoices_module_1.InvoicesModule,
            conversations_module_1.ConversationsModule,
            seeding_module_1.SeedingModule,
            statistics_module_1.StatisticsModule,
            admin_module_1.AdminModule,
            health_module_1.HealthModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map