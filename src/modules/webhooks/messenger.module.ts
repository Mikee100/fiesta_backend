import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MessengerController } from './messenger.controller';
import { MessengerService } from './messenger.service';
import { CustomersModule } from '../customers/customers.module';
import { MessagesModule } from '../messages/messages.module';
import { WebsocketModule } from '../../websockets/websocket.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    forwardRef(() => CustomersModule),
    forwardRef(() => MessagesModule),
    forwardRef(() => WebsocketModule),
    ConfigModule,
    BullModule.registerQueue({
      name: 'message-queue',
    }),
  ],
  controllers: [MessengerController],
  providers: [MessengerService],
  exports: [MessengerService],
})
export class MessengerModule {}
