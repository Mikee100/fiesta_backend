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
var MessengerController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessengerController = void 0;
const common_1 = require("@nestjs/common");
const messenger_service_1 = require("./messenger.service");
const messenger_stats_service_1 = require("./messenger-stats.service");
const messenger_send_service_1 = require("./messenger-send.service");
let MessengerController = MessengerController_1 = class MessengerController {
    constructor(messengerService, messengerStatsService, messengerSendService) {
        this.messengerService = messengerService;
        this.messengerStatsService = messengerStatsService;
        this.messengerSendService = messengerSendService;
        this.logger = new common_1.Logger(MessengerController_1.name);
    }
    async verifyWebhook(mode, token, challenge, res) {
        this.logger.log(`Received GET webhook verification: mode=${mode}, token=${token}, challenge=${challenge}`);
        const verified = this.messengerService.verifyWebhook(mode, token, challenge);
        if (verified) {
            this.logger.log('Webhook verified successfully.');
            return res.status(common_1.HttpStatus.OK).send(challenge);
        }
        else {
            this.logger.warn('Webhook verification failed.');
            return res.status(common_1.HttpStatus.FORBIDDEN).send('Verification failed');
        }
    }
    async handleMessage(req, res) {
        this.logger.log('Received POST webhook event.');
        await this.messengerService.handleMessage(req.body);
        return res.status(common_1.HttpStatus.OK).json({ status: 'ok' });
    }
    async getStats() {
        return this.messengerStatsService.getStats();
    }
    async getConversations() {
        return this.messengerStatsService.getConversations();
    }
    async getMessages(customerId) {
        return this.messengerService.getMessages(customerId);
    }
    async getConversationsList() {
        return this.messengerService.getConversations();
    }
    async sendMessage(data) {
        return this.messengerSendService.sendMessage(data.to, data.message);
    }
    async testConnection() {
        return this.messengerSendService.testConnection();
    }
};
exports.MessengerController = MessengerController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.verify_token')),
    __param(2, (0, common_1.Query)('hub.challenge')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "verifyWebhook", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "handleMessage", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('analytics/conversations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Get)('messages'),
    __param(0, (0, common_1.Query)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Get)('conversations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "getConversationsList", null);
__decorate([
    (0, common_1.Post)('send'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('test-connection'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MessengerController.prototype, "testConnection", null);
exports.MessengerController = MessengerController = MessengerController_1 = __decorate([
    (0, common_1.Controller)('webhooks/messenger'),
    __metadata("design:paramtypes", [messenger_service_1.MessengerService,
        messenger_stats_service_1.MessengerStatsService,
        messenger_send_service_1.MessengerSendService])
], MessengerController);
//# sourceMappingURL=messenger.controller.js.map