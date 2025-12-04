import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PackagesModule } from '../packages/packages.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PaymentsModule),
    MessagesModule,
    NotificationsModule,
    PackagesModule,
    WhatsappModule,
    CalendarModule,
    BullModule.registerQueue({
      name: 'bookingQueue',
    }),
  ],
  providers: [BookingsService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule { }
