import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MessengerController } from './messenger.controller';
import { MessengerService } from './messenger.service';
import { MessengerSendService } from './messenger-send.service';
import { MessengerStatsService } from './messenger-stats.service';
import { CustomersModule } from '../customers/customers.module';
import { MessagesModule } from '../messages/messages.module';
import { WebsocketModule } from '../../websockets/websocket.module';
// import { ConfigModule } from '@nestjs/config'; // This import is no longer needed based on the target `imports` array

@Module({
  imports: [
    BullModule.registerQueue({ name: 'message-queue' }),
    forwardRef(() => CustomersModule),
    forwardRef(() => MessagesModule),
    forwardRef(() => WebsocketModule),
    // ConfigModule, // Removed as per the target `imports` array
  ],
  controllers: [MessengerController],
  providers: [MessengerService, MessengerSendService, MessengerStatsService],
  exports: [MessengerService, MessengerSendService],
})
export class MessengerModule { }
