import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { MessagesModule } from '../messages/messages.module';
import { CustomersModule } from '../customers/customers.module';
import { AiModule } from '../ai/ai.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsModule } from '../payments/payments.module';
import { BullModule } from '@nestjs/bull';
import { WebsocketModule } from '../../websockets/websocket.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MessengerModule } from './messenger.module';

@Module({
  imports: [
    MessagesModule,
    CustomersModule,
    forwardRef(() => AiModule),
    BookingsModule,
    PaymentsModule,
    WhatsappModule,
    BullModule.registerQueue({
      name: 'messageQueue',
    }),
    WebsocketModule,
    MessengerModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule { }
