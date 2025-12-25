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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConditionalValidationPipe = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
let ConditionalValidationPipe = class ConditionalValidationPipe extends common_1.ValidationPipe {
    constructor(options) {
        const safeOptions = {
            ...options,
        };
        super(safeOptions);
    }
    transform(value, metadata) {
        if (metadata.type === 'body') {
            const isWebhookPayload = value && typeof value === 'object' &&
                (value.object === 'whatsapp_business_account' ||
                    value.object === 'instagram' ||
                    value.object === 'page' ||
                    Array.isArray(value.entry));
            if (!metadata.metatype) {
                if (isWebhookPayload) {
                    console.log('[ConditionalValidationPipe] Webhook payload detected (no metatype), skipping validation');
                }
                return value;
            }
            if (metadata.metatype === Object || metadata.metatype?.name === 'Object') {
                if (isWebhookPayload) {
                    console.log('[ConditionalValidationPipe] Webhook payload detected (Object metatype), skipping validation');
                }
                return value;
            }
            const metatypeName = metadata.metatype?.name;
            const plainTypes = ['String', 'Number', 'Boolean', 'Array', 'Date'];
            if (metatypeName && plainTypes.includes(metatypeName)) {
                return value;
            }
        }
        try {
            return super.transform(value, metadata);
        }
        catch (error) {
            if (metadata.type === 'body') {
                const isWebhookPayload = value && typeof value === 'object' &&
                    (value.object === 'whatsapp_business_account' ||
                        value.object === 'instagram' ||
                        value.object === 'page' ||
                        Array.isArray(value.entry));
                if (isWebhookPayload || !metadata.metatype || metadata.metatype === Object || metadata.metatype?.name === 'Object') {
                    console.log('[ConditionalValidationPipe] Validation error for webhook-like payload, allowing through:', error.message);
                    return value;
                }
            }
            console.error('[ConditionalValidationPipe] Validation error:', error);
            throw error;
        }
    }
};
exports.ConditionalValidationPipe = ConditionalValidationPipe;
exports.ConditionalValidationPipe = ConditionalValidationPipe = __decorate([
    (0, common_2.Injectable)(),
    __metadata("design:paramtypes", [Object])
], ConditionalValidationPipe);
//# sourceMappingURL=conditional-validation.pipe.js.map