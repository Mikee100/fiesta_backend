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
var ResponseQualityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseQualityService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
const prisma_service_1 = require("../../../prisma/prisma.service");
let ResponseQualityService = ResponseQualityService_1 = class ResponseQualityService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ResponseQualityService_1.name);
        this.MIN_HELPFULNESS = 7;
        this.MIN_ACCURACY = 8;
        this.MIN_EMPATHY = 6;
        this.MIN_CLARITY = 7;
        this.MIN_OVERALL = 7;
        this.ESCALATION_THRESHOLD = 5;
        this.openai = new openai_1.default({
            apiKey: this.configService.get('OPENAI_API_KEY')
        });
    }
    async validateResponse(response, context) {
        try {
            const quickValidation = this.quickValidation(response);
            if (!quickValidation.passed) {
                return {
                    passed: false,
                    score: {
                        helpfulness: 0,
                        accuracy: 0,
                        empathy: 0,
                        clarity: 0,
                        overall: 0,
                        issues: quickValidation.issues,
                        recommendations: quickValidation.recommendations,
                    },
                    shouldEscalate: false,
                    reason: quickValidation.reason,
                };
            }
            const score = await this.scoreResponse(response, context);
            const passed = score.helpfulness >= this.MIN_HELPFULNESS &&
                score.accuracy >= this.MIN_ACCURACY &&
                score.empathy >= this.MIN_EMPATHY &&
                score.clarity >= this.MIN_CLARITY &&
                score.overall >= this.MIN_OVERALL;
            const shouldEscalate = score.overall < this.ESCALATION_THRESHOLD;
            let improvedResponse;
            if (!passed && !shouldEscalate) {
                improvedResponse = await this.improveResponse(response, context, score);
            }
            await this.logQualityCheck(context.customerId, response, score, passed);
            return {
                passed,
                score,
                improvedResponse,
                shouldEscalate,
                reason: !passed ? this.generateFailureReason(score) : undefined,
            };
        }
        catch (error) {
            this.logger.error('Error validating response quality', error);
            return {
                passed: true,
                score: {
                    helpfulness: 5,
                    accuracy: 5,
                    empathy: 5,
                    clarity: 5,
                    overall: 5,
                    issues: ['Quality check failed'],
                    recommendations: [],
                },
                shouldEscalate: false,
            };
        }
    }
    quickValidation(response) {
        const issues = [];
        const recommendations = [];
        if (response.length < 10) {
            issues.push('Response too short');
            recommendations.push('Provide more detailed information');
            return { passed: false, issues, recommendations, reason: 'Response too short' };
        }
        if (response.length > 2000) {
            issues.push('Response too long');
            recommendations.push('Make response more concise');
        }
        if (response.includes('undefined') || response.includes('null')) {
            issues.push('Contains undefined/null values');
            recommendations.push('Check for template variable errors');
        }
        const placeholderPatterns = [
            /^sorry.*couldn.*process/i,
            /^i.*don.*understand/i,
            /^error/i,
            /^failed/i,
        ];
        if (placeholderPatterns.some(pattern => pattern.test(response) && response.length < 50)) {
            issues.push('Generic error response');
            recommendations.push('Provide more specific help');
            return { passed: false, issues, recommendations, reason: 'Generic error response' };
        }
        return { passed: true, issues, recommendations };
    }
    async scoreResponse(response, context) {
        const systemPrompt = `You are an expert quality assessor for customer service AI responses.
Rate the following AI response on these dimensions (0-10 scale):
1. Helpfulness: Does it answer the question and provide useful information?
2. Accuracy: Is the information correct and factual?
3. Empathy: Does it show understanding and care for the customer?
4. Clarity: Is it easy to understand and well-structured?

Context:
- User message: "${context.userMessage}"
- Intent: ${context.intent || 'unknown'}
- Emotional tone: ${context.emotionalTone || 'neutral'}

Return a JSON object with:
{
  "helpfulness": <0-10>,
  "accuracy": <0-10>,
  "empathy": <0-10>,
  "clarity": <0-10>,
  "issues": ["list of specific issues found"],
  "recommendations": ["suggestions for improvement"]
}`;
        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `AI Response to evaluate:\n\n${response}` },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3,
            });
            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const score = {
                helpfulness: result.helpfulness || 5,
                accuracy: result.accuracy || 5,
                empathy: result.empathy || 5,
                clarity: result.clarity || 5,
                overall: 0,
                issues: result.issues || [],
                recommendations: result.recommendations || [],
            };
            score.overall = (score.helpfulness +
                score.accuracy +
                score.empathy +
                score.clarity) / 4;
            return score;
        }
        catch (error) {
            this.logger.error('Error scoring response', error);
            return {
                helpfulness: 5,
                accuracy: 5,
                empathy: 5,
                clarity: 5,
                overall: 5,
                issues: ['Scoring failed'],
                recommendations: [],
            };
        }
    }
    async improveResponse(originalResponse, context, score) {
        const improvementPrompt = `Improve this AI customer service response. The original response scored:
- Helpfulness: ${score.helpfulness}/10
- Accuracy: ${score.accuracy}/10
- Empathy: ${score.empathy}/10
- Clarity: ${score.clarity}/10

Issues identified: ${score.issues.join(', ')}
Recommendations: ${score.recommendations.join(', ')}

Original response:
${originalResponse}

User message: "${context.userMessage}"
Intent: ${context.intent || 'unknown'}
Emotional tone: ${context.emotionalTone || 'neutral'}

IMPORTANT: Return ONLY the improved response text. Do not include any prefixes like "Improved Response:" or labels. Just return the improved message text directly.`;
        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are an expert at improving customer service responses. Return ONLY the improved response text without any labels or prefixes. Make responses more helpful, accurate, empathetic, and clear.' },
                    { role: 'user', content: improvementPrompt },
                ],
                temperature: 0.7,
            });
            let improved = completion.choices[0].message.content?.trim() || originalResponse;
            improved = this.cleanImprovedResponse(improved);
            const improvedScore = await this.scoreResponse(improved, context);
            if (improvedScore.overall > score.overall) {
                this.logger.log(`Response improved: ${score.overall.toFixed(1)} → ${improvedScore.overall.toFixed(1)}`);
                return improved;
            }
            return originalResponse;
        }
        catch (error) {
            this.logger.error('Error improving response', error);
            return originalResponse;
        }
    }
    cleanImprovedResponse(response) {
        const prefixesToRemove = [
            /^Improved Response:\s*/i,
            /^Improved:\s*/i,
            /^Here's the improved response:\s*/i,
            /^Improved version:\s*/i,
            /^Better response:\s*/i,
        ];
        let cleaned = response;
        for (const prefix of prefixesToRemove) {
            cleaned = cleaned.replace(prefix, '');
        }
        return cleaned.trim();
    }
    generateFailureReason(score) {
        const reasons = [];
        if (score.helpfulness < this.MIN_HELPFULNESS) {
            reasons.push('not helpful enough');
        }
        if (score.accuracy < this.MIN_ACCURACY) {
            reasons.push('accuracy concerns');
        }
        if (score.empathy < this.MIN_EMPATHY) {
            reasons.push('lacks empathy');
        }
        if (score.clarity < this.MIN_CLARITY) {
            reasons.push('unclear');
        }
        return reasons.length > 0
            ? `Quality check failed: ${reasons.join(', ')}`
            : 'Quality check failed';
    }
    async logQualityCheck(customerId, response, score, passed) {
        try {
            this.logger.debug(`Quality check: customer=${customerId}, ` +
                `passed=${passed}, overall=${score.overall.toFixed(1)}, ` +
                `helpfulness=${score.helpfulness}, accuracy=${score.accuracy}`);
        }
        catch (error) {
            this.logger.warn('Failed to log quality check', error);
        }
    }
    async getQualityStats(days = 7) {
        return {
            totalChecks: 0,
            passed: 0,
            failed: 0,
            avgScore: 0,
            avgHelpfulness: 0,
            avgAccuracy: 0,
            avgEmpathy: 0,
            avgClarity: 0,
        };
    }
};
exports.ResponseQualityService = ResponseQualityService;
exports.ResponseQualityService = ResponseQualityService = ResponseQualityService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], ResponseQualityService);
//# sourceMappingURL=response-quality.service.js.map