// src/modules/ai/services/proactive-outreach.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../../prisma/prisma.service';
import { MessagesService } from '../../messages/messages.service';

@Injectable()
export class ProactiveOutreachService {
    private readonly logger = new Logger(ProactiveOutreachService.name);

    constructor(
        private prisma: PrismaService,
        private messagesService: MessagesService,
        @InjectQueue('outreachQueue') private outreachQueue: Queue,
    ) { }

    /**
     * Detect and schedule follow-ups for abandoned bookings
     */
    async detectAbandonedBookings() {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Find drafts older than 24h that haven't been followed up
        const abandonedDrafts = await this.prisma.bookingDraft.findMany({
            where: {
                updatedAt: { lt: twentyFourHoursAgo },
                step: { not: 'confirm' }, // Not yet confirmed
            },
            include: {
                customer: true,
            },
        });

        this.logger.log(`Found ${abandonedDrafts.length} abandoned bookings`);

        for (const draft of abandonedDrafts) {
            // Check if we've already sent an outreach for this draft
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
                    scheduledFor: new Date(), // Send immediately
                    metadata: { draftId: draft.id, draftStep: draft.step },
                });
            }
        }

        return abandonedDrafts.length;
    }

    /**
     * Schedule pregnancy milestone outreach (28 weeks = optimal shoot time)
     */
    async schedulePregnancyMilestones() {
        // This would integrate with customer data about due dates
        // For now, we'll check customers who booked and might be due for another shoot

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
            const daysSinceBooking = Math.floor(
                (Date.now() - lastBooking.dateTime.getTime()) / (1000 * 60 * 60 * 24)
            );

            // If it's been 6-9 months, they might be pregnant again or have a newborn
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

    /**
     * Send post-shoot satisfaction check (48h after shoot)
     */
    async sendPostShootFollowup() {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

        // Find bookings that happened 48-72h ago
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

    /**
     * Re-engage inactive customers (90+ days)
     */
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

    /**
     * Celebrate customer milestones (birthdays, anniversaries)
     */
    async celebrateMilestones() {
        // This would integrate with customer birthday data
        // For now, we'll celebrate booking anniversaries

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        oneYearAgo.setDate(oneYearAgo.getDate() - 3); // 3-day window

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

    /**
     * Schedule an outreach message
     */
    async scheduleOutreach(data: {
        customerId: string;
        type: string;
        messageContent: string;
        scheduledFor: Date;
        campaignId?: string;
        metadata?: any;
    }) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: data.customerId },
        });

        if (!customer) {
            this.logger.warn(`Customer ${data.customerId} not found`);
            return null;
        }

        // Determine best channel
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

        // Add to Bull queue for processing
        await this.outreachQueue.add(
            'send-outreach',
            { outreachId: outreach.id },
            {
                delay: Math.max(0, data.scheduledFor.getTime() - Date.now()),
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 60000, // 1 minute
                },
            }
        );

        this.logger.log(`Scheduled ${data.type} outreach for customer ${data.customerId}`);
        return outreach;
    }

    /**
     * Process outreach (called by Bull queue)
     */
    async processOutreach(outreachId: string) {
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
            // Send message via appropriate channel
            await this.messagesService.sendOutboundMessage(
                outreach.customerId,
                outreach.messageContent,
                outreach.channel
            );

            // Update status
            await this.prisma.proactiveOutreach.update({
                where: { id: outreachId },
                data: {
                    status: 'sent',
                    sentAt: new Date(),
                },
            });

            this.logger.log(`Sent ${outreach.type} outreach to customer ${outreach.customerId}`);
        } catch (error) {
            this.logger.error(`Failed to send outreach ${outreachId}:`, error);

            await this.prisma.proactiveOutreach.update({
                where: { id: outreachId },
                data: { status: 'failed' },
            });
        }
    }

    // Message generators
    private generateAbandonedBookingMessage(draft: any): string {
        return `Hi ${draft.customer.name || 'there'}! 💕\n\nI noticed you were interested in booking a ${draft.service || 'photoshoot'} with us. Is there anything I can help you with to complete your booking?\n\nI'm here to answer any questions you might have! 🌸`;
    }

    private generateMilestoneMessage(customer: any): string {
        return `Hi ${customer.name}! 💖\n\nWe loved working with you before! If you're expecting again or know someone who is, we'd love to capture those beautiful moments.\n\nWe have some gorgeous new backdrops and special packages available! Interested? 🌸`;
    }

    private generatePostShootMessage(booking: any): string {
        return `Hi ${booking.customer.name}! 💕\n\nWe hope you enjoyed your photoshoot with us! We'd love to hear about your experience.\n\nHow was everything? Your feedback helps us serve you better! 🌸\n\nYour beautiful photos will be ready soon! ✨`;
    }

    private generateReengagementMessage(customer: any): string {
        const name = customer.name || 'there';
        return `Hi ${name}! 💖\n\nWe've missed you! We have some exciting new packages and beautiful seasonal backdrops.\n\nWould you like to see what's new? We'd love to work with you again! 🌸`;
    }

    private generateMilestoneAnniversaryMessage(booking: any): string {
        return `Hi ${booking.customer.name}! 🎉\n\nIt's been a year since your beautiful photoshoot with us! Time flies! 💕\n\nWe'd love to capture more precious moments with you. Interested in a newborn or family session? 👶✨`;
    }

    /**
     * Get outreach statistics
     */
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
            byType: {} as Record<string, number>,
        };

        outreaches.forEach(o => {
            stats.byType[o.type] = (stats.byType[o.type] || 0) + 1;
        });

        const responded = outreaches.filter(o => o.responseReceived).length;
        stats.responseRate = stats.sent > 0 ? responded / stats.sent : 0;

        return stats;
    }
}
