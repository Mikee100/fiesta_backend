import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    MessagesModule,
    forwardRef(() => BookingsModule),
    BullModule.registerQueue({
      name: 'aiQueue',
    }),
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
