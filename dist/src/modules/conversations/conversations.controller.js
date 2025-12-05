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
exports.ConversationsController = void 0;
const common_1 = require("@nestjs/common");
const conversations_service_1 = require("./conversations.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const instagram_service_1 = require("../instagram/instagram.service");
const messenger_send_service_1 = require("../webhooks/messenger-send.service");
let ConversationsController = class ConversationsController {
    constructor(conversationsService, whatsappService, instagramService, messengerSendService) {
        this.conversationsService = conversationsService;
        this.whatsappService = whatsappService;
        this.instagramService = instagramService;
        this.messengerSendService = messengerSendService;
    }
    async getAllConversations(platform, limit, offset) {
        return this.conversationsService.getAllConversations(platform, limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
    }
    async getConversation(id) {
        return this.conversationsService.getConversationById(id);
    }
    async getMessages(id, platform) {
        return this.conversationsService.getConversationMessages(id, platform);
    }
    async sendReply(id, body) {
        const { message, platform } = body;
        const conversation = await this.conversationsService.getConversationById(id);
        if (platform === 'whatsapp' && conversation.whatsappId) {
            await this.whatsappService.sendMessage(conversation.whatsappId, message);
        }
        else if (platform === 'instagram' && conversation.instagramId) {
            await this.instagramService.sendMessage(conversation.instagramId, message);
        }
        else if (platform === 'messenger' && conversation.messengerId) {
            await this.messengerSendService.sendMessage(conversation.messengerId, message);
        }
        else {
            throw new Error(`Platform ${platform} not supported or customer ID not found`);
        }
        return this.conversationsService.sendReply(id, message, platform);
    }
};
exports.ConversationsController = ConversationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('platform')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ConversationsController.prototype, "getAllConversations", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConversationsController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Get)(':id/messages'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ConversationsController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)(':id/reply'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ConversationsController.prototype, "sendReply", null);
exports.ConversationsController = ConversationsController = __decorate([
    (0, common_1.Controller)('conversations'),
    __metadata("design:paramtypes", [conversations_service_1.ConversationsService,
        whatsapp_service_1.WhatsappService,
        instagram_service_1.InstagramService,
        messenger_send_service_1.MessengerSendService])
], ConversationsController);
//# sourceMappingURL=conversations.controller.js.map