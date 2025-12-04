"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkersModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const message_queue_processor_1 = require("../../workers/message-queue.processor");
const ai_queue_processor_1 = require("../../workers/ai-queue.processor");
const booking_queue_processor_1 = require("../../workers/booking-queue.processor");
const messages_module_1 = require("../modules/messages/messages.module");
const ai_module_1 = require("../modules/ai/ai.module");
const bookings_module_1 = require("../modules/bookings/bookings.module");
const whatsapp_module_1 = require("../modules/whatsapp/whatsapp.module");
const instagram_module_1 = require("../modules/instagram/instagram.module");
const customers_module_1 = require("../modules/customers/customers.module");
const websocket_module_1 = require("../websockets/websocket.module");
let WorkersModule = class WorkersModule {
};
exports.WorkersModule = WorkersModule;
exports.WorkersModule = WorkersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.registerQueue({
                name: 'messageQueue',
            }),
            bull_1.BullModule.registerQueue({
                name: 'aiQueue',
            }),
            bull_1.BullModule.registerQueue({
                name: 'bookingQueue',
            }),
            messages_module_1.MessagesModule,
            ai_module_1.AiModule,
            bookings_module_1.BookingsModule,
            whatsapp_module_1.WhatsappModule,
            instagram_module_1.InstagramModule,
            customers_module_1.CustomersModule,
            websocket_module_1.WebsocketModule,
        ],
        providers: [
            message_queue_processor_1.MessageQueueProcessor,
            ai_queue_processor_1.AiQueueProcessor,
            booking_queue_processor_1.BookingQueueProcessor,
        ],
    })
], WorkersModule);
//# sourceMappingURL=workers.module.js.map