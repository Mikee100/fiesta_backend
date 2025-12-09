import { Module, forwardRef } from '@nestjs/common';
import { EscalationService } from './escalation.service';
import { EscalationController } from './escalation.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { WebsocketModule } from '../../websockets/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [PrismaModule, WebsocketModule, forwardRef(() => NotificationsModule)],
    controllers: [EscalationController],
    providers: [EscalationService],
    exports: [EscalationService],
})
export class EscalationModule { }
