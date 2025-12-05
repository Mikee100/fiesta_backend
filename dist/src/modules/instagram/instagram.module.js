"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const instagram_controller_1 = require("./instagram.controller");
const instagram_service_1 = require("./instagram.service");
const instagram_stats_service_1 = require("./instagram-stats.service");
const messages_module_1 = require("../messages/messages.module");
const customers_module_1 = require("../customers/customers.module");
let InstagramModule = class InstagramModule {
};
exports.InstagramModule = InstagramModule;
exports.InstagramModule = InstagramModule = __decorate([
    (0, common_1.Module)({
        imports: [
            messages_module_1.MessagesModule,
            customers_module_1.CustomersModule,
            bull_1.BullModule.registerQueue({
                name: 'messageQueue',
            }),
        ],
        controllers: [instagram_controller_1.InstagramController],
        providers: [instagram_service_1.InstagramService, instagram_stats_service_1.InstagramStatsService],
        exports: [instagram_service_1.InstagramService],
    })
], InstagramModule);
//# sourceMappingURL=instagram.module.js.map