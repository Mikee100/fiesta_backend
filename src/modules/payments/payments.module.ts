import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { PaymentsService } from './payments.service';
import { PaymentsProcessor } from './payments.processor';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { BookingsModule } from '../bookings/bookings.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentListener } from './listeners/payment.listener';
import { PackagesModule } from '../packages/packages.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MessengerModule } from '../webhooks/messenger.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    MessagesModule,
    NotificationsModule,
    PackagesModule,
    forwardRef(() => BookingsModule),
    BullModule.registerQueue({
      name: 'aiQueue',
    }),
    BullModule.registerQueue({
      name: 'paymentsQueue',
    }),
    forwardRef(() => AiModule),
    WhatsappModule,
    MessengerModule,
  ],
  providers: [PaymentsService, PaymentsProcessor, PaymentListener],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule { }
