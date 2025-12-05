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
var ProactiveOutreachService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProactiveOutreachService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../../prisma/prisma.service");
const messages_service_1 = require("../../messages/messages.service");
let ProactiveOutreachService = ProactiveOutreachService_1 = class ProactiveOutreachService {
    constructor(prisma, messagesService, outreachQueue) {
        this.prisma = prisma;
        this.messagesService = messagesService;
        this.outreachQueue = outreachQueue;
        this.logger = new common_1.Logger(ProactiveOutreachService_1.name);
    }
    async detectAbandonedBookings() {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const abandonedDrafts = await this.prisma.bookingDraft.findMany({
            where: {
                updatedAt: { lt: twentyFourHoursAgo },
                step: { not: 'confirm' },
            },
            include: {
                customer: true,
            },
        });
        this.logger.log(`Found ${abandonedDrafts.length} abandoned bookings`);
        for (const draft of abandonedDrafts) {
            const existingOutreach = await this.prisma.proactiveOutreach.findFirst({
                where: {
                    customerId: draft.customerId,
                    type: 'abandoned_booking',
                    createdAt: { gte: twentyFourHoursAgo },
                },
            });
            if (!existingOutreach) {
                await this.scheduleOutreach({
                    customerId: draft.customerId,
                    type: 'abandoned_booking',
                    messageContent: this.generateAbandonedBookingMessage(draft),
                    scheduledFor: new Date(),
                    metadata: { draftId: draft.id, draftStep: draft.step },
                });
            }
        }
        return abandonedDrafts.length;
    }
    async schedulePregnancyMilestones() {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const pastCustomers = await this.prisma.customer.findMany({
            where: {
                bookings: {
                    some: {
                        dateTime: { gte: sixMonthsAgo },
                        status: 'confirmed',
                    },
                },
            },
            include: {
                bookings: {
                    where: { status: 'confirmed' },
                    orderBy: { dateTime: 'desc' },
                    take: 1,
                },
                customerMemory: true,
            },
        });
        let scheduled = 0;
        for (const customer of pastCustomers) {
            const lastBooking = customer.bookings[0];
            const daysSinceBooking = Math.floor((Date.now() - lastBooking.dateTime.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceBooking >= 180 && daysSinceBooking <= 270) {
                const existingOutreach = await this.prisma.proactiveOutreach.findFirst({
                    where: {
                        customerId: customer.id,
                        type: 'pregnancy_milestone',
                        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    },
                });
                if (!existingOutreach) {
                    await this.scheduleOutreach({
                        customerId: customer.id,
                        type: 'pregnancy_milestone',
                        messageContent: this.generateMilestoneMessage(customer),
                        scheduledFor: new Date(),
                    });
                    scheduled++;
                }
            }
        }
        this.logger.log(`Scheduled ${scheduled} pregnancy milestone outreaches`);
        return scheduled;
    }
    async sendPostShootFollowup() {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
        const recentShoots = await this.prisma.booking.findMany({
            where: {
                dateTime: {
                    gte: threeDaysAgo,
                    lte: twoDaysAgo,
                },
                status: 'confirmed',
            },
            include: {
                customer: true,
            },
        });
        let sent = 0;
        for (const booking of recentShoots) {
            const existingOutreach = await this.prisma.proactiveOutreach.findFirst({
                where: {
                    customerId: booking.customerId,
                    type: 'post_shoot',
                    metadata: {
                        path: ['bookingId'],
                        equals: booking.id,
                    },
                },
            });
            if (!existingOutreach) {
                await this.scheduleOutreach({
                    customerId: booking.customerId,
                    type: 'post_shoot',
                    messageContent: this.generatePostShootMessage(booking),
                    scheduledFor: new Date(),
                    metadata: { bookingId: booking.id },
                });
                sent++;
            }
        }
        this.logger.log(`Sent ${sent} post-shoot follow-ups`);
        return sent;
    }
    async reengageInactiveCustomers() {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const inactiveCustomers = await this.prisma.customer.findMany({
            where: {
                messages: {
                    some: {
                        createdAt: { lt: ninetyDaysAgo },
                    },
                },
                customerMemory: {
                    relationshipStage: { in: ['interested', 'booked', 'returning'] },
                },
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                customerMemory: true,
            },
        });
        let reengaged = 0;
        for (const customer of inactiveCustomers) {
            const existingOutreach = await this.prisma.proactiveOutreach.findFirst({
                where: {
                    customerId: customer.id,
                    type: 'reengagement',
                    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                },
            });
            if (!existingOutreach) {
                await this.scheduleOutreach({
                    customerId: customer.id,
                    type: 'reengagement',
                    messageContent: this.generateReengagementMessage(customer),
                    scheduledFor: new Date(),
                });
                reengaged++;
            }
        }
        this.logger.log(`Re-engaged ${reengaged} inactive customers`);
        return reengaged;
    }
    async celebrateMilestones() {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        oneYearAgo.setDate(oneYearAgo.getDate() - 3);
        const anniversaries = await this.prisma.booking.findMany({
            where: {
                dateTime: {
                    gte: oneYearAgo,
                    lte: new Date(oneYearAgo.getTime() + 7 * 24 * 60 * 60 * 1000),
                },
                status: 'confirmed',
            },
            include: {
                customer: true,
            },
        });
        let celebrated = 0;
        for (const booking of anniversaries) {
            const existingOutreach = await this.prisma.proactiveOutreach.findFirst({
                where: {
                    customerId: booking.customerId,
                    type: 'milestone',
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            });
            if (!existingOutreach) {
                await this.scheduleOutreach({
                    customerId: booking.customerId,
                    type: 'milestone',
                    messageContent: this.generateMilestoneAnniversaryMessage(booking),
                    scheduledFor: new Date(),
                    metadata: { bookingId: booking.id, anniversaryYear: 1 },
                });
                celebrated++;
            }
        }
        this.logger.log(`Celebrated ${celebrated} milestones`);
        return celebrated;
    }
    async scheduleOutreach(data) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: data.customerId },
        });
        if (!customer) {
            this.logger.warn(`Customer ${data.customerId} not found`);
            return null;
        }
        const channel = customer.whatsappId
            ? 'whatsapp'
            : customer.instagramId
                ? 'instagram'
                : customer.messengerId
                    ? 'messenger'
                    : null;
        if (!channel) {
            this.logger.warn(`No channel available for customer ${data.customerId}`);
            return null;
        }
        const outreach = await this.prisma.proactiveOutreach.create({
            data: {
                customerId: data.customerId,
                type: data.type,
                messageContent: data.messageContent,
                scheduledFor: data.scheduledFor,
                channel,
                campaignId: data.campaignId,
                metadata: data.metadata,
            },
        });
        await this.outreachQueue.add('send-outreach', { outreachId: outreach.id }, {
            delay: Math.max(0, data.scheduledFor.getTime() - Date.now()),
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 60000,
            },
        });
        this.logger.log(`Scheduled ${data.type} outreach for customer ${data.customerId}`);
        return outreach;
    }
    async processOutreach(outreachId) {
        const outreach = await this.prisma.proactiveOutreach.findUnique({
            where: { id: outreachId },
            include: { customer: true },
        });
        if (!outreach) {
            this.logger.error(`Outreach ${outreachId} not found`);
            return;
        }
        if (outreach.status !== 'pending') {
            this.logger.warn(`Outreach ${outreachId} already processed (${outreach.status})`);
            return;
        }
        try {
            await this.messagesService.sendOutboundMessage(outreach.customerId, outreach.messageContent, outreach.channel);
            await this.prisma.proactiveOutreach.update({
                where: { id: outreachId },
                data: {
                    status: 'sent',
                    sentAt: new Date(),
                },
            });
            this.logger.log(`Sent ${outreach.type} outreach to customer ${outreach.customerId}`);
        }
        catch (error) {
            this.logger.error(`Failed to send outreach ${outreachId}:`, error);
            await this.prisma.proactiveOutreach.update({
                where: { id: outreachId },
                data: { status: 'failed' },
            });
        }
    }
    generateAbandonedBookingMessage(draft) {
        return `Hi ${draft.customer.name || 'there'}! 💕\n\nI noticed you were interested in booking a ${draft.service || 'photoshoot'} with us. Is there anything I can help you with to complete your booking?\n\nI'm here to answer any questions you might have! 🌸`;
    }
    generateMilestoneMessage(customer) {
        return `Hi ${customer.name}! 💖\n\nWe loved working with you before! If you're expecting again or know someone who is, we'd love to capture those beautiful moments.\n\nWe have some gorgeous new backdrops and special packages available! Interested? 🌸`;
    }
    generatePostShootMessage(booking) {
        return `Hi ${booking.customer.name}! 💕\n\nWe hope you enjoyed your photoshoot with us! We'd love to hear about your experience.\n\nHow was everything? Your feedback helps us serve you better! 🌸\n\nYour beautiful photos will be ready soon! ✨`;
    }
    generateReengagementMessage(customer) {
        const name = customer.name || 'there';
        return `Hi ${name}! 💖\n\nWe've missed you! We have some exciting new packages and beautiful seasonal backdrops.\n\nWould you like to see what's new? We'd love to work with you again! 🌸`;
    }
    generateMilestoneAnniversaryMessage(booking) {
        return `Hi ${booking.customer.name}! 🎉\n\nIt's been a year since your beautiful photoshoot with us! Time flies! 💕\n\nWe'd love to capture more precious moments with you. Interested in a newborn or family session? 👶✨`;
    }
    async getOutreachStats(days = 30) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const outreaches = await this.prisma.proactiveOutreach.findMany({
            where: { createdAt: { gte: since } },
        });
        const stats = {
            total: outreaches.length,
            sent: outreaches.filter(o => o.status === 'sent').length,
            pending: outreaches.filter(o => o.status === 'pending').length,
            failed: outreaches.filter(o => o.status === 'failed').length,
            responseRate: 0,
            byType: {},
        };
        outreaches.forEach(o => {
            stats.byType[o.type] = (stats.byType[o.type] || 0) + 1;
        });
        const responded = outreaches.filter(o => o.responseReceived).length;
        stats.responseRate = stats.sent > 0 ? responded / stats.sent : 0;
        return stats;
    }
};
exports.ProactiveOutreachService = ProactiveOutreachService;
exports.ProactiveOutreachService = ProactiveOutreachService = ProactiveOutreachService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bull_1.InjectQueue)('outreachQueue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messages_service_1.MessagesService, Object])
], ProactiveOutreachService);
//# sourceMappingURL=proactive-outreach.service.js.map