import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor() {}

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() data: { platform: string }, @ConnectedSocket() client: Socket) {
    client.join(data.platform);
    console.log(`Client ${client.id} joined ${data.platform}`);
  }

  // Method to emit new message to clients
  emitNewMessage(platform: string, message: any) {
    this.server.to(platform).emit('newMessage', message);
  }

  // Method to emit conversation updates
  emitConversationUpdate(platform: string, conversation: any) {
    this.server.to(platform).emit('conversationUpdate', conversation);
  }

  // Method to emit typing indicator
  emitTyping(platform: string, customerId: string, isTyping: boolean) {
    this.server.to(platform).emit('typing', { customerId, isTyping });
  }

  // Method to emit new escalation to admin clients
  emitNewEscalation(escalation: any) {
    this.server.to('admin').emit('newEscalation', escalation);
  }

  // Method to emit new notification to admin clients
  emitNewNotification(notification: any) {
    this.server.to('admin').emit('newNotification', notification);
    // Also emit notification count update
    this.server.to('admin').emit('notificationCountUpdate');
  }

  // Method to emit escalation resolved
  emitEscalationResolved(escalationId: string) {
    this.server.to('admin').emit('escalationResolved', { escalationId });
  }
}
