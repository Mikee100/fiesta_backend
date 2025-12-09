import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EscalationService {
    private readonly logger = new Logger(EscalationService.name);

    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => WebsocketGateway)) @Optional() private websocketGateway?: WebsocketGateway,
        @Inject(forwardRef(() => NotificationsService)) @Optional() private notificationsService?: NotificationsService
    ) { }

    async createEscalation(
        customerId: string,
        reason?: string,
        escalationType: string = 'manual',
        metadata?: any,
        sentimentScore?: number
    ) {
        this.logger.log(`Escalating customer ${customerId} for reason: ${reason} (type: ${escalationType})`);

        // 1. Create Escalation record
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

        // 2. Pause AI for this customer (unless it's a booking cancellation - handled separately)
        if (escalationType !== 'booking_cancellation') {
            await this.prisma.customer.update({
                where: { id: customerId },
                data: { isAiPaused: true },
            });
        }

        // 3. Emit WebSocket event to admin clients
        if (this.websocketGateway) {
            try {
                const escalationWithCustomer = await this.prisma.escalation.findUnique({
                    where: { id: escalation.id },
                    include: { customer: true },
                });
                this.websocketGateway.emitNewEscalation(escalationWithCustomer);
            } catch (error) {
                this.logger.error(`Failed to emit escalation WebSocket event: ${error.message}`);
            }
        }

        // 4. ALWAYS create admin notification for ALL escalations
        if (this.notificationsService) {
            try {
                const escalationWithCustomer = await this.prisma.escalation.findUnique({
                    where: { id: escalation.id },
                    include: { customer: true },
                });

                const customer = escalationWithCustomer?.customer;
                const customerName = customer?.name?.replace(/^WhatsApp User\s+/i, '') || customer?.phone || 'Unknown';
                
                // Determine notification type based on escalation type
                let notificationType: 'reschedule_request' | 'ai_escalation' = 'ai_escalation';
                if (escalationType === 'booking_cancellation' || escalationType.includes('reschedule')) {
                    notificationType = 'reschedule_request';
                }

                // Create appropriate title and message
                let title = 'Escalation - Requires Admin Attention';
                let message = reason || 'Customer requires admin assistance';

                if (escalationType === 'booking_cancellation') {
                    title = 'Booking Cancellation Request';
                    message = `Customer wants to cancel booking: ${reason || 'No reason provided'}`;
                } else if (escalationType.includes('payment')) {
                    title = 'Payment Issue - Admin Assistance Required';
                    message = `Payment issue reported: ${reason || 'Customer needs help with payment'}`;
                } else if (escalationType.includes('package')) {
                    title = 'Package Issue - Admin Assistance Required';
                    message = `Package-related issue: ${reason || 'Customer needs help with package selection'}`;
                } else if (escalationType.includes('reschedule')) {
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
            } catch (error) {
                this.logger.error(`Failed to create escalation notification: ${error.message}`);
            }
        }

        return escalation;
    }

    async resolveEscalation(escalationId: string) {
        this.logger.log(`Resolving escalation ${escalationId}`);

        const escalation = await this.prisma.escalation.update({
            where: { id: escalationId },
            data: { status: 'RESOLVED' },
        });

        // Unpause AI for this customer
        await this.prisma.customer.update({
            where: { id: escalation.customerId },
            data: { isAiPaused: false },
        });

        // Emit WebSocket event
        if (this.websocketGateway) {
            try {
                this.websocketGateway.emitEscalationResolved(escalationId);
            } catch (error) {
                this.logger.error(`Failed to emit escalation resolved WebSocket event: ${error.message}`);
            }
        }

        return escalation;
    }

    async isCustomerEscalated(customerId: string): Promise<boolean> {
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
}
