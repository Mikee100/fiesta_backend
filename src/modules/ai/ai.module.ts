import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiSettingsService } from './ai-settings.service';
import { AdminAiController } from './admin-ai.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MessagesModule } from '../messages/messages.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => BookingsModule),
    forwardRef(() => MessagesModule),
    CustomersModule,
    BullModule.registerQueue({
      name: 'aiQueue',
    }),
    forwardRef(() => require('../payments/payments.module').PaymentsModule),
  ],
  controllers: [AiController, AdminAiController],
  providers: [AiService, AiSettingsService],
  exports: [AiService, AiSettingsService],
})
export class AiModule {}
