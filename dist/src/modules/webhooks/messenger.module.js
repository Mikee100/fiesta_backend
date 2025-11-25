"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessengerModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const messenger_controller_1 = require("./messenger.controller");
const messenger_service_1 = require("./messenger.service");
const customers_module_1 = require("../customers/customers.module");
const messages_module_1 = require("../messages/messages.module");
const websocket_module_1 = require("../../websockets/websocket.module");
const config_1 = require("@nestjs/config");
let MessengerModule = class MessengerModule {
};
exports.MessengerModule = MessengerModule;
exports.MessengerModule = MessengerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => customers_module_1.CustomersModule),
            (0, common_1.forwardRef)(() => messages_module_1.MessagesModule),
            (0, common_1.forwardRef)(() => websocket_module_1.WebsocketModule),
            config_1.ConfigModule,
            bull_1.BullModule.registerQueue({
                name: 'message-queue',
            }),
        ],
        controllers: [messenger_controller_1.MessengerController],
        providers: [messenger_service_1.MessengerService],
        exports: [messenger_service_1.MessengerService],
    })
], MessengerModule);
//# sourceMappingURL=messenger.module.js.map