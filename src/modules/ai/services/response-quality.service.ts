// src/modules/ai/services/response-quality.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../prisma/prisma.service';

interface QualityScore {
    helpfulness: number; // 0-10
    accuracy: number; // 0-10
    empathy: number; // 0-10
    clarity: number; // 0-10
    overall: number; // Average of all scores
    issues: string[]; // List of identified issues
    recommendations: string[]; // Suggestions for improvement
}

interface ValidationResult {
    passed: boolean;
    score: QualityScore;
    improvedResponse?: string;
    shouldEscalate: boolean;
    reason?: string;
}

@Injectable()
export class ResponseQualityService {
    private readonly logger = new Logger(ResponseQualityService.name);
    private readonly openai: OpenAI;
    
    // Quality thresholds
    private readonly MIN_HELPFULNESS = 7;
    private readonly MIN_ACCURACY = 8;
    private readonly MIN_EMPATHY = 6;
    private readonly MIN_CLARITY = 7;
    private readonly MIN_OVERALL = 7;
    
    // Confidence threshold for escalation
    private readonly ESCALATION_THRESHOLD = 5; // If overall < 5, escalate

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
    ) {
        this.openai = new OpenAI({ 
            apiKey: this.configService.get<string>('OPENAI_API_KEY') 
        });
    }

    /**
     * Validate response quality before sending
     */
    async validateResponse(
        response: string,
        context: {
            userMessage: string;
            customerId: string;
            intent?: string;
            emotionalTone?: string;
            history?: any[];
        }
    ): Promise<ValidationResult> {
        try {
            // Quick validation rules first (fast, no API call)
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

            // Deep quality scoring using AI
            const score = await this.scoreResponse(response, context);
            
            // Check if response passes quality thresholds
            const passed = 
                score.helpfulness >= this.MIN_HELPFULNESS &&
                score.accuracy >= this.MIN_ACCURACY &&
                score.empathy >= this.MIN_EMPATHY &&
                score.clarity >= this.MIN_CLARITY &&
                score.overall >= this.MIN_OVERALL;

            // Determine if should escalate
            const shouldEscalate = score.overall < this.ESCALATION_THRESHOLD;

            // If failed, try to improve
            let improvedResponse: string | undefined;
            if (!passed && !shouldEscalate) {
                improvedResponse = await this.improveResponse(response, context, score);
            }

            // Log quality check
            await this.logQualityCheck(context.customerId, response, score, passed);

            return {
                passed,
                score,
                improvedResponse,
                shouldEscalate,
                reason: !passed ? this.generateFailureReason(score) : undefined,
            };
        } catch (error) {
            this.logger.error('Error validating response quality', error);
            // On error, allow response but log it
            return {
                passed: true, // Fail open to avoid blocking all responses
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

    /**
     * Quick validation rules (no API call)
     */
    private quickValidation(response: string): {
        passed: boolean;
        issues: string[];
        recommendations: string[];
        reason?: string;
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Check response length
        if (response.length < 10) {
            issues.push('Response too short');
            recommendations.push('Provide more detailed information');
            return { passed: false, issues, recommendations, reason: 'Response too short' };
        }

        if (response.length > 2000) {
            issues.push('Response too long');
            recommendations.push('Make response more concise');
        }

        // Check for common issues
        if (response.includes('undefined') || response.includes('null')) {
            issues.push('Contains undefined/null values');
            recommendations.push('Check for template variable errors');
        }

        // Check for empty or placeholder responses
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

    /**
     * Score response using AI
     */
    private async scoreResponse(
        response: string,
        context: {
            userMessage: string;
            intent?: string;
            emotionalTone?: string;
        }
    ): Promise<QualityScore> {
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
                model: 'gpt-4o-mini', // Fast and cost-effective for validation
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `AI Response to evaluate:\n\n${response}` },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3, // Lower temperature for consistent scoring
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            
            const score: QualityScore = {
                helpfulness: result.helpfulness || 5,
                accuracy: result.accuracy || 5,
                empathy: result.empathy || 5,
                clarity: result.clarity || 5,
                overall: 0,
                issues: result.issues || [],
                recommendations: result.recommendations || [],
            };

            // Calculate overall score
            score.overall = (
                score.helpfulness +
                score.accuracy +
                score.empathy +
                score.clarity
            ) / 4;

            return score;
        } catch (error) {
            this.logger.error('Error scoring response', error);
            // Return neutral score on error
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

    /**
     * Improve a low-quality response
     */
    private async improveResponse(
        originalResponse: string,
        context: {
            userMessage: string;
            intent?: string;
            emotionalTone?: string;
        },
        score: QualityScore
    ): Promise<string> {
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
            
            // Clean up any unwanted prefixes that might still appear
            improved = this.cleanImprovedResponse(improved);
            
            // Validate improved response isn't worse
            const improvedScore = await this.scoreResponse(improved, context);
            if (improvedScore.overall > score.overall) {
                this.logger.log(`Response improved: ${score.overall.toFixed(1)} → ${improvedScore.overall.toFixed(1)}`);
                return improved;
            }

            // If improvement didn't help, return original
            return originalResponse;
        } catch (error) {
            this.logger.error('Error improving response', error);
            return originalResponse; // Return original on error
        }
    }

    /**
     * Clean up improved response by removing unwanted prefixes
     */
    private cleanImprovedResponse(response: string): string {
        // Remove common prefixes that AI might add
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

    /**
     * Generate failure reason from score
     */
    private generateFailureReason(score: QualityScore): string {
        const reasons: string[] = [];

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

    /**
     * Log quality check for analytics
     */
    private async logQualityCheck(
        customerId: string,
        response: string,
        score: QualityScore,
        passed: boolean
    ): Promise<void> {
        try {
            // Store in a quality check log table (you may need to create this in Prisma schema)
            // For now, we'll log it
            this.logger.debug(
                `Quality check: customer=${customerId}, ` +
                `passed=${passed}, overall=${score.overall.toFixed(1)}, ` +
                `helpfulness=${score.helpfulness}, accuracy=${score.accuracy}`
            );

            // You can also store this in the database if you add a QualityCheck model
            // await this.prisma.qualityCheck.create({ ... });
        } catch (error) {
            this.logger.warn('Failed to log quality check', error);
        }
    }

    /**
     * Get quality statistics
     */
    async getQualityStats(days = 7): Promise<{
        totalChecks: number;
        passed: number;
        failed: number;
        avgScore: number;
        avgHelpfulness: number;
        avgAccuracy: number;
        avgEmpathy: number;
        avgClarity: number;
    }> {
        // This would query the quality check logs
        // For now, return placeholder
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
}
