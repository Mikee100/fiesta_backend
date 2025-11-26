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
var PaymentsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const payments_service_1 = require("./payments.service");
let PaymentsController = PaymentsController_1 = class PaymentsController {
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
        this.logger = new common_1.Logger(PaymentsController_1.name);
    }
    async getPaymentStatus(checkoutRequestId) {
        const payment = await this.paymentsService.getPaymentByCheckoutRequestId(checkoutRequestId);
        if (!payment) {
            return { status: 'not_found' };
        }
        return { status: payment.status, payment };
    }
    async handleCallback(body) {
        this.logger.log('✅ M-Pesa callback received:', JSON.stringify(body));
        await this.paymentsService.handleCallback(body);
        return {
            ResultCode: 0,
            ResultDesc: 'Accepted'
        };
    }
    getCallbackHealth() {
        return { status: 'ok', message: 'M-Pesa callback endpoint is up. Use POST for callbacks.' };
    }
    async testStkPush(body) {
        this.logger.log(`[TEST] STK Push requested for phone: ${body.phone}, amount: ${body.amount}`);
        try {
            const result = await this.paymentsService.testStkPush(body.phone, body.amount);
            return { success: true, ...result };
        }
        catch (error) {
            this.logger.error(`[TEST] STK Push failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Get)('status/:checkoutRequestId'),
    __param(0, (0, common_1.Param)('checkoutRequestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "getPaymentStatus", null);
__decorate([
    (0, common_1.Post)('callback'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "handleCallback", null);
__decorate([
    (0, common_1.Get)('callback'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "getCallbackHealth", null);
__decorate([
    (0, common_1.Post)('test-stk-push'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "testStkPush", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, common_1.Controller)('mpesa'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map