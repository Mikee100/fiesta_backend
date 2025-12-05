import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MessageQueueProcessor } from '../../workers/message-queue.processor';
import { AiQueueProcessor } from '../../workers/ai-queue.processor';
import { BookingQueueProcessor } from '../../workers/booking-queue.processor';
import { MessagesModule } from '../modules/messages/messages.module';
import { AiModule } from '../modules/ai/ai.module';
import { BookingsModule } from '../modules/bookings/bookings.module';
import { WhatsappModule } from '../modules/whatsapp/whatsapp.module';
import { InstagramModule } from '../modules/instagram/instagram.module';
import { MessengerModule } from '../modules/webhooks/messenger.module';
import { CustomersModule } from '../modules/customers/customers.module';
import { WebsocketModule } from '../websockets/websocket.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'messageQueue',
    }),
    BullModule.registerQueue({
      name: 'aiQueue',
    }),
    BullModule.registerQueue({
      name: 'bookingQueue',
    }),
    MessagesModule,
    AiModule,
    BookingsModule,
    WhatsappModule,
    InstagramModule,
    MessengerModule,
    CustomersModule,
    WebsocketModule,
  ],
  providers: [
    MessageQueueProcessor,
    AiQueueProcessor,
    BookingQueueProcessor,
  ],
})
export class WorkersModule { }

