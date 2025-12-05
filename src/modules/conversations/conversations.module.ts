import { Module, forwardRef } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { InstagramModule } from '../instagram/instagram.module';
import { MessengerModule } from '../webhooks/messenger.module';

@Module({
    imports: [
        PrismaModule,
        forwardRef(() => WhatsappModule),
        forwardRef(() => InstagramModule),
        forwardRef(() => MessengerModule),
    ],
    controllers: [ConversationsController],
    providers: [ConversationsService],
    exports: [ConversationsService],
})
export class ConversationsModule { }
