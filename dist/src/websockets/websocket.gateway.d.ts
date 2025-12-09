import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    constructor();
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoin(data: {
        platform: string;
    }, client: Socket): void;
    emitNewMessage(platform: string, message: any): void;
    emitConversationUpdate(platform: string, conversation: any): void;
    emitTyping(platform: string, customerId: string, isTyping: boolean): void;
    emitNewEscalation(escalation: any): void;
    emitNewNotification(notification: any): void;
    emitEscalationResolved(escalationId: string): void;
}
