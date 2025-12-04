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
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../prisma/prisma.service");
const ai_service_1 = require("../ai/ai.service");
let MessagesService = class MessagesService {
    constructor(prisma, messageQueue, aiService) {
        this.prisma = prisma;
        this.messageQueue = messageQueue;
        this.aiService = aiService;
    }
    async create(createMessageDto) {
        const message = await this.prisma.message.create({
            data: createMessageDto,
        });
        return message;
    }
    async findAll() {
        return this.prisma.message.findMany({
            include: { customer: true },
        });
    }
    async countMessages(args) {
        return this.prisma.message.count(args);
    }
    async findByCustomer(customerId) {
        return this.prisma.message.findMany({
            where: { customerId },
            include: { customer: true },
        });
    }
    async findOne(id) {
        return this.prisma.message.findUnique({
            where: { id },
            include: { customer: true },
        });
    }
    async findByExternalId(externalId) {
        return this.prisma.message.findUnique({
            where: { externalId },
            include: { customer: true },
        });
    }
    async classifyIntent(content, history = []) {
        console.log('Classifying intent for content:', content, 'with history length:', history.length);
        if (history.length > 0) {
            try {
                const historyContext = history.slice(-5).join('\n');
                const prompt = `Classify the intent of the following user message based on the conversation history. Intent definitions:
- greeting: hello, hi, good morning, etc.
- booking_inquiry: asking about availability, services, booking process, or making general booking requests
- booking_details: providing specific details for a booking like service type, date/time, or confirming a time slot (e.g., "10 am is good", "yes", "that works")
- booking_update: requesting to change or reschedule an existing booking
- faq: questions about business info like hours, location, prices
- confirmation: agreeing to or confirming something (yes, ok, sounds good)
- general: other casual conversation

History:
${historyContext}

Message: ${content}

Respond with only the intent (e.g., booking_details).`;
                const response = await this.aiService.generateResponse(prompt, 'dummy', {}, []);
                const aiIntent = response.trim().toLowerCase();
                if (['greeting', 'booking_inquiry', 'booking_details', 'booking_update', 'faq', 'confirmation', 'general'].includes(aiIntent)) {
                    console.log('AI classified intent:', aiIntent);
                    return aiIntent;
                }
                else {
                    console.log('AI classification invalid, falling back to keywords');
                }
            }
            catch (error) {
                console.error('AI classification failed, falling back to keywords:', error);
            }
        }
        const lower = content.toLowerCase();
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('good morning') || lower.includes('good afternoon') || lower.includes('good evening')) {
            console.log('Classified as greeting');
            return 'greeting';
        }
        if (lower.includes('book') || lower.includes('appointment') || lower.includes('schedule') || lower.includes('free') || lower.includes('opening') || lower.includes('tomorrow') || lower.includes('reschedule') || lower.includes('cancel') || lower.includes('change')) {
            console.log('Classified as booking_inquiry');
            return 'booking_inquiry';
        }
        if (lower.includes('help') || lower.includes('question') || lower.includes('info') || lower.includes('what') || lower.includes('how') || lower.includes('price') || lower.includes('cost') || lower.includes('hours') || lower.includes('location')) {
            console.log('Classified as faq');
            return 'faq';
        }
        if (lower.includes('confirm') || lower.includes('ok') || lower.includes('sure') || lower.includes('yes please') || lower.includes('sounds good')) {
            console.log('Classified as confirmation');
            return 'confirmation';
        }
        console.log('Classified as general');
        return 'general';
    }
    async sendOutboundMessage(customerId, content, platform) {
        const message = await this.create({
            content,
            platform,
            direction: 'outbound',
            customerId,
        });
        if (platform === 'whatsapp') {
            const customer = await this.prisma.customer.findUnique({
                where: { id: customerId },
            });
            if (customer?.whatsappId) {
            }
        }
        return message;
    }
    async getConversationHistory(customerId, limit = 10) {
        const messages = await this.prisma.message.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                content: true,
                direction: true,
                createdAt: true,
            },
        });
        const chronological = messages.reverse();
        return chronological.map(msg => ({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.content,
        }));
    }
    async getEnrichedContext(customerId) {
        const [history, customer, bookingDraft] = await Promise.all([
            this.getConversationHistory(customerId, 10),
            this.prisma.customer.findUnique({
                where: { id: customerId },
                include: {
                    bookings: {
                        where: { status: { in: ['confirmed', 'completed'] } },
                        orderBy: { createdAt: 'desc' },
                        take: 3,
                    },
                },
            }),
            this.prisma.bookingDraft.findUnique({
                where: { customerId },
            }),
        ]);
        return {
            history,
            customer: {
                name: customer?.name,
                totalBookings: customer?.bookings?.length || 0,
                recentBookings: customer?.bookings || [],
                isReturning: (customer?.bookings?.length || 0) > 0,
            },
            bookingDraft,
        };
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('messageQueue')),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => ai_service_1.AiService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, ai_service_1.AiService])
], MessagesService);
//# sourceMappingURL=messages.service.js.map