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
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./modules/auth/auth.module");
const bookings_module_1 = require("./modules/bookings/bookings.module");
const customers_module_1 = require("./modules/customers/customers.module");
const messages_module_1 = require("./modules/messages/messages.module");
const ai_module_1 = require("./modules/ai/ai.module");
const webhooks_module_1 = require("./modules/webhooks/webhooks.module");
const calendar_module_1 = require("./modules/calendar/calendar.module");
const whatsapp_module_1 = require("./modules/whatsapp/whatsapp.module");
const instagram_module_1 = require("./modules/instagram/instagram.module");
const workers_module_1 = require("./workers/workers.module");
const websocket_module_1 = require("./websockets/websocket.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            bull_1.BullModule.forRoot({
                redis: process.env.REDIS_URL || 'redis://localhost:6379',
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            bookings_module_1.BookingsModule,
            customers_module_1.CustomersModule,
            messages_module_1.MessagesModule,
            ai_module_1.AiModule,
            webhooks_module_1.WebhooksModule,
            calendar_module_1.CalendarModule,
            whatsapp_module_1.WhatsappModule,
            instagram_module_1.InstagramModule,
            workers_module_1.WorkersModule,
            websocket_module_1.WebsocketModule,
            analytics_module_1.AnalyticsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map