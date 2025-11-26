"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const bull_1 = require("@nestjs/bull");
const payments_service_1 = require("./payments.service");
const payments_controller_1 = require("./payments.controller");
const prisma_module_1 = require("../../prisma/prisma.module");
const messages_module_1 = require("../messages/messages.module");
const bookings_module_1 = require("../bookings/bookings.module");
const ai_module_1 = require("../ai/ai.module");
let PaymentsModule = class PaymentsModule {
};
exports.PaymentsModule = PaymentsModule;
exports.PaymentsModule = PaymentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            axios_1.HttpModule,
            messages_module_1.MessagesModule,
            (0, common_1.forwardRef)(() => bookings_module_1.BookingsModule),
            bull_1.BullModule.registerQueue({
                name: 'aiQueue',
            }),
            (0, common_1.forwardRef)(() => ai_module_1.AiModule),
        ],
        providers: [payments_service_1.PaymentsService],
        controllers: [payments_controller_1.PaymentsController],
        exports: [payments_service_1.PaymentsService],
    })
], PaymentsModule);
//# sourceMappingURL=payments.module.js.map