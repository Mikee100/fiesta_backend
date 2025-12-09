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
var EscalationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscalationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const websocket_gateway_1 = require("../../websockets/websocket.gateway");
const notifications_service_1 = require("../notifications/notifications.service");
let EscalationService = EscalationService_1 = class EscalationService {
    constructor(prisma, websocketGateway, notificationsService) {
        this.prisma = prisma;
        this.websocketGateway = websocketGateway;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(EscalationService_1.name);
    }
    async createEscalation(customerId, reason, escalationType = 'manual', metadata, sentimentScore) {
        this.logger.log(`Escalating customer ${customerId} for reason: ${reason} (type: ${escalationType})`);
        const escalation = await this.prisma.escalation.create({
            data: {
                customerId,
                reason,
                status: 'OPEN',
                escalationType,
                metadata: metadata || null,
                sentimentScore: sentimentScore || null,
            },
        });
        if (escalationType !== 'booking_cancellation') {
            await this.prisma.customer.update({
                where: { id: customerId },
                data: { isAiPaused: true },
            });
        }
        if (this.websocketGateway) {
            try {
                const escalationWithCustomer = await this.prisma.escalation.findUnique({
                    where: { id: escalation.id },
                    include: { customer: true },
                });
                this.websocketGateway.emitNewEscalation(escalationWithCustomer);
            }
            catch (error) {
                this.logger.error(`Failed to emit escalation WebSocket event: ${error.message}`);
            }
        }
        if (this.notificationsService) {
            try {
                const escalationWithCustomer = await this.prisma.escalation.findUnique({
                    where: { id: escalation.id },
                    include: { customer: true },
                });
                const customer = escalationWithCustomer?.customer;
                const customerName = customer?.name?.replace(/^WhatsApp User\s+/i, '') || customer?.phone || 'Unknown';
                let notificationType = 'ai_escalation';
                if (escalationType === 'booking_cancellation' || escalationType.includes('reschedule')) {
                    notificationType = 'reschedule_request';
                }
                let title = 'Escalation - Requires Admin Attention';
                let message = reason || 'Customer requires admin assistance';
                if (escalationType === 'booking_cancellation') {
                    title = 'Booking Cancellation Request';
                    message = `Customer wants to cancel booking: ${reason || 'No reason provided'}`;
                }
                else if (escalationType.includes('payment')) {
                    title = 'Payment Issue - Admin Assistance Required';
                    message = `Payment issue reported: ${reason || 'Customer needs help with payment'}`;
                }
                else if (escalationType.includes('package')) {
                    title = 'Package Issue - Admin Assistance Required';
                    message = `Package-related issue: ${reason || 'Customer needs help with package selection'}`;
                }
                else if (escalationType.includes('reschedule')) {
                    title = 'Rescheduling Request';
                    message = `Rescheduling request: ${reason || 'Customer wants to reschedule booking'}`;
                }
                await this.notificationsService.createNotification({
                    type: notificationType,
                    title,
                    message,
                    metadata: {
                        customerId,
                        customerName,
                        customerPhone: customer?.phone || customer?.whatsappId,
                        escalationId: escalation.id,
                        escalationType,
                        ...metadata,
                    },
                });
                this.logger.log(`[ESCALATION] Created admin notification for escalation ${escalation.id} (type: ${escalationType})`);
            }
            catch (error) {
                this.logger.error(`Failed to create escalation notification: ${error.message}`);
            }
        }
        return escalation;
    }
    async resolveEscalation(escalationId) {
        this.logger.log(`Resolving escalation ${escalationId}`);
        const escalation = await this.prisma.escalation.update({
            where: { id: escalationId },
            data: { status: 'RESOLVED' },
        });
        await this.prisma.customer.update({
            where: { id: escalation.customerId },
            data: { isAiPaused: false },
        });
        if (this.websocketGateway) {
            try {
                this.websocketGateway.emitEscalationResolved(escalationId);
            }
            catch (error) {
                this.logger.error(`Failed to emit escalation resolved WebSocket event: ${error.message}`);
            }
        }
        return escalation;
    }
    async isCustomerEscalated(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { isAiPaused: true },
        });
        return customer?.isAiPaused || false;
    }
    async getOpenEscalations() {
        return this.prisma.escalation.findMany({
            where: { status: 'OPEN' },
            include: { customer: true },
            orderBy: { createdAt: 'desc' },
        });
    }
};
exports.EscalationService = EscalationService;
exports.EscalationService = EscalationService = EscalationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => websocket_gateway_1.WebsocketGateway))),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        websocket_gateway_1.WebsocketGateway,
        notifications_service_1.NotificationsService])
], EscalationService);
//# sourceMappingURL=escalation.service.js.map