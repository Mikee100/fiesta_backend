"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscalationModule = void 0;
const common_1 = require("@nestjs/common");
const escalation_service_1 = require("./escalation.service");
const escalation_controller_1 = require("./escalation.controller");
const prisma_module_1 = require("../../prisma/prisma.module");
const websocket_module_1 = require("../../websockets/websocket.module");
const notifications_module_1 = require("../notifications/notifications.module");
let EscalationModule = class EscalationModule {
};
exports.EscalationModule = EscalationModule;
exports.EscalationModule = EscalationModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, websocket_module_1.WebsocketModule, (0, common_1.forwardRef)(() => notifications_module_1.NotificationsModule)],
        controllers: [escalation_controller_1.EscalationController],
        providers: [escalation_service_1.EscalationService],
        exports: [escalation_service_1.EscalationService],
    })
], EscalationModule);
//# sourceMappingURL=escalation.module.js.map