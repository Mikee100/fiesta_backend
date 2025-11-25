"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAiController = void 0;
const common_1 = require("@nestjs/common");
const ai_settings_service_1 = require("./ai-settings.service");
const messages_service_1 = require("../messages/messages.service");
const customers_service_1 = require("../customers/customers.service");
let AdminAiController = class AdminAiController {
    constructor(aiSettingsService, messagesService, customersService) {
        this.aiSettingsService = aiSettingsService;
        this.messagesService = messagesService;
        this.customersService = customersService;
    }
    async toggleAi(enabled) {
        const result = await this.aiSettingsService.setAiEnabled(enabled);
        return { success: true, aiEnabled: result.aiEnabled };
    }
    async sendManualReminder(body) {
        const { customerId, bookingId, message } = body;
        const customer = await this.customersService.findOne(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        let platform = 'messenger';
        if (!customer.messengerId) {
            if (customer.whatsappId) {
                platform = 'whatsapp';
            }
            else if (customer.instagramId) {
                platform = 'instagram';
            }
            else {
                throw new Error('No platform ID available for customer');
            }
        }
        await this.messagesService.sendOutboundMessage(customerId, message, platform);
        return { success: true };
    }
};
exports.AdminAiController = AdminAiController;
__decorate([
    (0, common_1.Post)('toggle'),
    __param(0, (0, common_1.Body)('enabled')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Boolean]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "toggleAi", null);
__decorate([
    (0, common_1.Post)('send-reminder'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminAiController.prototype, "sendManualReminder", null);
exports.AdminAiController = AdminAiController = __decorate([
    (0, common_1.Controller)('admin/ai'),
    __metadata("design:paramtypes", [ai_settings_service_1.AiSettingsService,
        messages_service_1.MessagesService,
        customers_service_1.CustomersService])
], AdminAiController);
//# sourceMappingURL=admin-ai.controller.js.map