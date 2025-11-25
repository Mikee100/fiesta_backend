"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksModule = void 0;
const common_1 = require("@nestjs/common");
const webhooks_controller_1 = require("./webhooks.controller");
const webhooks_service_1 = require("./webhooks.service");
const messages_module_1 = require("../messages/messages.module");
const customers_module_1 = require("../customers/customers.module");
const ai_module_1 = require("../ai/ai.module");
const bookings_module_1 = require("../bookings/bookings.module");
const payments_module_1 = require("../payments/payments.module");
const bull_1 = require("@nestjs/bull");
const websocket_module_1 = require("../../websockets/websocket.module");
const messenger_module_1 = require("./messenger.module");
let WebhooksModule = class WebhooksModule {
};
exports.WebhooksModule = WebhooksModule;
exports.WebhooksModule = WebhooksModule = __decorate([
    (0, common_1.Module)({
        imports: [
            messages_module_1.MessagesModule,
            customers_module_1.CustomersModule,
            ai_module_1.AiModule,
            bookings_module_1.BookingsModule,
            payments_module_1.PaymentsModule,
            bull_1.BullModule.registerQueue({
                name: 'messageQueue',
            }),
            websocket_module_1.WebsocketModule,
            messenger_module_1.MessengerModule,
        ],
        controllers: [webhooks_controller_1.WebhooksController],
        providers: [webhooks_service_1.WebhooksService],
    })
], WebhooksModule);
//# sourceMappingURL=webhooks.module.js.map