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
exports.WebhooksController = void 0;
const common_1 = require("@nestjs/common");
const webhooks_service_1 = require("./webhooks.service");
let WebhooksController = class WebhooksController {
    constructor(webhooksService) {
        this.webhooksService = webhooksService;
    }
    verifyWhatsApp(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
            return challenge;
        }
        return 'ERROR';
    }
    handleWhatsApp(body) {
        return this.webhooksService.handleWhatsAppWebhook(body);
    }
    verifyInstagram(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
            return challenge;
        }
        return 'ERROR';
    }
    handleInstagram(body) {
        return this.webhooksService.handleInstagramWebhook(body);
    }
    handleMessenger(body) {
        return this.webhooksService.handleMessengerWebhook(body);
    }
    handleTelegram(body) {
        return this.webhooksService.handleTelegramWebhook(body);
    }
    verifyFacebook(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
            return challenge;
        }
        throw new common_1.HttpException('Forbidden', common_1.HttpStatus.FORBIDDEN);
    }
};
exports.WebhooksController = WebhooksController;
__decorate([
    (0, common_1.Get)('whatsapp'),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.challenge')),
    __param(2, (0, common_1.Query)('hub.verify_token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "verifyWhatsApp", null);
__decorate([
    (0, common_1.Post)('whatsapp'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "handleWhatsApp", null);
__decorate([
    (0, common_1.Get)('instagram'),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.challenge')),
    __param(2, (0, common_1.Query)('hub.verify_token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "verifyInstagram", null);
__decorate([
    (0, common_1.Post)('instagram'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "handleInstagram", null);
__decorate([
    (0, common_1.Post)('messenger'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "handleMessenger", null);
__decorate([
    (0, common_1.Post)('telegram'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "handleTelegram", null);
__decorate([
    (0, common_1.Get)('facebook'),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.challenge')),
    __param(2, (0, common_1.Query)('hub.verify_token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "verifyFacebook", null);
exports.WebhooksController = WebhooksController = __decorate([
    (0, common_1.Controller)('webhooks'),
    __metadata("design:paramtypes", [webhooks_service_1.WebhooksService])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map