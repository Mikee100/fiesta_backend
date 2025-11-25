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
var MessengerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessengerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const customers_service_1 = require("../customers/customers.service");
const messages_service_1 = require("../messages/messages.service");
const websocket_gateway_1 = require("../../websockets/websocket.gateway");
const bull_1 = require("@nestjs/bull");
let MessengerService = MessengerService_1 = class MessengerService {
    constructor(configService, customersService, messagesService, websocketGateway, messageQueue) {
        this.configService = configService;
        this.customersService = customersService;
        this.messagesService = messagesService;
        this.websocketGateway = websocketGateway;
        this.messageQueue = messageQueue;
        this.logger = new common_1.Logger(MessengerService_1.name);
        this.fbVerifyToken = this.configService.get('FB_VERIFY_TOKEN');
    }
    verifyWebhook(mode, token, challenge) {
        this.logger.log(`Verifying webhook: mode=${mode}, token=${token}`);
        if (mode === 'subscribe' && token === this.fbVerifyToken) {
            return challenge;
        }
        return null;
    }
    async handleMessage(body) {
        this.logger.log('Handling incoming Messenger webhook body:', JSON.stringify(body));
        if (!body.object || body.object !== 'page' || !Array.isArray(body.entry)) {
            this.logger.warn('Invalid webhook body.');
            return;
        }
        for (const entry of body.entry) {
            if (!Array.isArray(entry.messaging))
                continue;
            for (const event of entry.messaging) {
                const senderId = event.sender?.id;
                const message = event.message;
                if (!senderId || !message || !message.mid) {
                    this.logger.warn('Missing sender or message data.');
                    continue;
                }
                const existing = await this.messagesService.findByExternalId(message.mid);
                if (existing) {
                    this.logger.log(`Duplicate message detected: mid=${message.mid}`);
                    continue;
                }
                let customer = await this.customersService.findByMessengerId(senderId);
                if (!customer) {
                    this.logger.log(`Customer not found for Messenger ID ${senderId}, creating...`);
                    customer = await this.customersService.createWithMessengerId(senderId);
                    this.logger.log(`Customer created: id=${customer.id}`);
                }
                const savedMessage = await this.messagesService.create({
                    customerId: customer.id,
                    platform: 'messenger',
                    direction: 'inbound',
                    externalId: message.mid,
                    content: message.text || '',
                });
                this.logger.log(`Message saved: id=${savedMessage.id}`);
                this.websocketGateway.emitNewMessage('messenger', savedMessage);
                this.logger.log('WebSocket event emitted for new message.');
                await this.messageQueue.add('ai-process', { messageId: savedMessage.id });
                this.logger.log('Message queued for AI processing.');
            }
        }
    }
};
exports.MessengerService = MessengerService;
exports.MessengerService = MessengerService = MessengerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => customers_service_1.CustomersService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => messages_service_1.MessagesService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => websocket_gateway_1.WebsocketGateway))),
    __param(4, (0, bull_1.InjectQueue)('message-queue')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        customers_service_1.CustomersService,
        messages_service_1.MessagesService,
        websocket_gateway_1.WebsocketGateway, Object])
], MessengerService);
//# sourceMappingURL=messenger.service.js.map