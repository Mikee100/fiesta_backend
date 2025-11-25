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
const ai_controller_1 = require("./ai.controller");
const ai_service_1 = require("./ai.service");
const ai_settings_service_1 = require("./ai-settings.service");
const admin_ai_controller_1 = require("./admin-ai.controller");
const prisma_module_1 = require("../../prisma/prisma.module");
const bookings_module_1 = require("../bookings/bookings.module");
const messages_module_1 = require("../messages/messages.module");
const customers_module_1 = require("../customers/customers.module");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => bookings_module_1.BookingsModule),
            (0, common_1.forwardRef)(() => messages_module_1.MessagesModule),
            customers_module_1.CustomersModule,
            bull_1.BullModule.registerQueue({
                name: 'aiQueue',
            }),
        ],
        controllers: [ai_controller_1.AiController, admin_ai_controller_1.AdminAiController],
        providers: [ai_service_1.AiService, ai_settings_service_1.AiSettingsService],
        exports: [ai_service_1.AiService, ai_settings_service_1.AiSettingsService],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map