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
var OutreachProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutreachProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const proactive_outreach_service_1 = require("../services/proactive-outreach.service");
let OutreachProcessor = OutreachProcessor_1 = class OutreachProcessor {
    constructor(proactiveOutreach) {
        this.proactiveOutreach = proactiveOutreach;
        this.logger = new common_1.Logger(OutreachProcessor_1.name);
    }
    async handleSendOutreach(job) {
        const { outreachId } = job.data;
        this.logger.log(`Processing outreach ${outreachId}`);
        try {
            await this.proactiveOutreach.processOutreach(outreachId);
            return { success: true, outreachId };
        }
        catch (error) {
            this.logger.error(`Failed to process outreach ${outreachId}:`, error);
            throw error;
        }
    }
};
exports.OutreachProcessor = OutreachProcessor;
__decorate([
    (0, bull_1.Process)('send-outreach'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OutreachProcessor.prototype, "handleSendOutreach", null);
exports.OutreachProcessor = OutreachProcessor = OutreachProcessor_1 = __decorate([
    (0, bull_1.Processor)('outreachQueue'),
    __metadata("design:paramtypes", [proactive_outreach_service_1.ProactiveOutreachService])
], OutreachProcessor);
//# sourceMappingURL=outreach.processor.js.map