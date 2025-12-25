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
const throttler_1 = require("@nestjs/throttler");
const webhooks_service_1 = require("./webhooks.service");
const webhook_validation_pipe_1 = require("../../common/pipes/webhook-validation.pipe");
let WebhooksController = class WebhooksController {
    constructor(webhooksService) {
        this.webhooksService = webhooksService;
    }
    verifyWhatsApp(mode, challenge, token) {
        console.log('[Webhook] Verifying WhatsApp:', { mode, token, expected: process.env.WHATSAPP_VERIFY_TOKEN });
        if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
            console.log('[Webhook] Verification successful!');
            return challenge;
        }
        console.log('[Webhook] Verification failed!');
        return 'ERROR';
    }
    async handleWhatsApp(body) {
        try {
            return await this.webhooksService.handleWhatsAppWebhook(body);
        }
        catch (error) {
            console.error('[WEBHOOK CONTROLLER] Error handling webhook:', error);
            throw error;
        }
    }
    verifyInstagram(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
            return challenge;
        }
        return 'ERROR';
    }
    async handleInstagram(body) {
        console.log('[WEBHOOK] Instagram webhook received');
        try {
            const result = await this.webhooksService.handleInstagramWebhook(body);
            console.log('[WEBHOOK] Instagram webhook processed successfully');
            return result;
        }
        catch (error) {
            console.error('[WEBHOOK CONTROLLER] Error handling Instagram webhook:', error);
            console.error('[WEBHOOK CONTROLLER] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            throw error;
        }
    }
    async handleMessenger(body) {
        return await this.webhooksService.handleMessengerWebhook(body);
    }
    async handleTelegram(body) {
        return await this.webhooksService.handleTelegramWebhook(body);
    }
    verifyFacebook(mode, challenge, token) {
        if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
            return challenge;
        }
        throw new common_1.HttpException('Forbidden', common_1.HttpStatus.FORBIDDEN);
    }
    async testQueue(body) {
        console.log('[TEST] Testing queue with data:', body);
        return await this.webhooksService.testQueueConnection(body);
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
    __metadata("design:returntype", Promise)
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
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "handleInstagram", null);
__decorate([
    (0, common_1.Post)('messenger'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "handleMessenger", null);
__decorate([
    (0, common_1.Post)('telegram'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
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
__decorate([
    (0, common_1.Post)('test-queue'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "testQueue", null);
exports.WebhooksController = WebhooksController = __decorate([
    (0, common_1.Controller)('webhooks'),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.UsePipes)(webhook_validation_pipe_1.WebhookValidationPipe),
    __metadata("design:paramtypes", [webhooks_service_1.WebhooksService])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map