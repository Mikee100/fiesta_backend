import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomersService } from '../customers/customers.service';
import { MessagesService } from '../messages/messages.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);
  private readonly fbVerifyToken: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => CustomersService)) private readonly customersService: CustomersService,
    @Inject(forwardRef(() => MessagesService)) private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => WebsocketGateway)) private readonly websocketGateway: WebsocketGateway,
    @InjectQueue('message-queue') private readonly messageQueue: Queue,
    private readonly prisma: PrismaService,
  ) {
    this.fbVerifyToken = this.configService.get<string>('FB_VERIFY_TOKEN');
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    this.logger.log(`Verifying webhook: mode=${mode}, token=${token}`);
    if (mode === 'subscribe' && token === this.fbVerifyToken) {
      return challenge;
    }
    return null;
  }

  async handleMessage(body: any) {
    this.logger.log('Handling incoming Messenger webhook body:', JSON.stringify(body));
    if (!body.object || body.object !== 'page' || !Array.isArray(body.entry)) {
      this.logger.warn('Invalid webhook body.');
      return;
    }
    for (const entry of body.entry) {
      if (!Array.isArray(entry.messaging)) continue;
      for (const event of entry.messaging) {
        const senderId = event.sender?.id;
        const message = event.message;

        // Ignore echo messages (messages sent by the bot itself)
        if (message?.is_echo) {
          this.logger.log('Ignoring echo message (sent by bot)');
          continue;
        }

        if (!senderId || !message || !message.mid) {
          this.logger.warn('Missing sender or message data.');
          continue;
        }
        // Prevent duplicate messages
        const existing = await this.messagesService.findByExternalId(message.mid);
        if (existing) {
          this.logger.log(`Duplicate message detected: mid=${message.mid}`);
          continue;
        }
        // Find or create customer
        let customer = await this.customersService.findByMessengerId(senderId);
        if (!customer) {
          this.logger.log(`Customer not found for Messenger ID ${senderId}, creating...`);
          customer = await this.customersService.createWithMessengerId(senderId);
          this.logger.log(`Customer created: id=${customer.id}`);
        }

        // Update lastMessengerMessageAt for 24hr window tracking
        await this.customersService.updateLastMessengerMessageAt(senderId, new Date());
        this.logger.log('✅ Updated lastMessengerMessageAt for 24-hour window tracking');

        // Save message
        const savedMessage = await this.messagesService.create({
          customerId: customer.id,
          platform: 'messenger',
          direction: 'inbound',
          externalId: message.mid,
          content: message.text || '',
        });
        this.logger.log(`Message saved: id=${savedMessage.id}`);
        // Emit WebSocket event
        this.websocketGateway.emitNewMessage('messenger', savedMessage);
        this.logger.log('WebSocket event emitted for new message.');
        // Queue for AI processing
        await this.messageQueue.add('ai-process', { messageId: savedMessage.id });
        this.logger.log('Message queued for AI processing.');
      }
    }
  }

  // -------------------------------------------
  // GET MESSAGES FOR UI
  // -------------------------------------------
  async getMessages(customerId?: string) {
    const messages = await this.messagesService.findAll();
    let filtered = messages.filter(m => m.platform === 'messenger');

    if (customerId) {
      filtered = filtered.filter(m => m.customerId === customerId);
    }

    return {
      messages: filtered.map(m => ({
        id: m.id,
        from: m.direction === 'inbound'
          ? (m.customer as any)?.messengerId || ''
          : '',
        to: m.direction === 'outbound'
          ? (m.customer as any)?.messengerId || ''
          : '',
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        direction: m.direction,
        customerId: m.customerId,
        customerName: (m.customer as any)?.name,
      })),
      total: filtered.length,
    };
  }

  // -------------------------------------------
  // GET CONVERSATIONS FOR UI
  // -------------------------------------------
  // Query customers directly with messenger messages (more reliable)
  async getConversations() {
    try {
      const conversations = await this.prisma.customer.findMany({
        where: {
          messengerId: { not: null },
          messages: {
            some: { platform: 'messenger' },
          },
        },
        select: {
          id: true,
          name: true,
          messengerId: true,
          aiEnabled: true,
          lastMessengerMessageAt: true,
          messages: {
            where: { platform: 'messenger' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              createdAt: true,
              direction: true,
            },
          },
        },
        orderBy: { lastMessengerMessageAt: 'desc' },
      });

      this.logger.debug(`[getConversations] Found ${conversations.length} messenger customers with messages`);

      const formattedConversations = conversations.map((conv) => ({
        id: conv.id,
        customerId: conv.id,
        customerName: conv.name || 'Unknown',
        messengerId: conv.messengerId || '',
        lastMessage: conv.messages[0]?.content || '',
        lastMessageAt: conv.messages[0]?.createdAt?.toISOString() || conv.lastMessengerMessageAt?.toISOString() || new Date().toISOString(),
        aiEnabled: conv.aiEnabled ?? true,
      }));

      return {
        conversations: formattedConversations,
        total: formattedConversations.length,
      };
    } catch (error) {
      this.logger.error('[getConversations] Error fetching conversations:', error);
      return {
        conversations: [],
        total: 0,
      };
    }
  }
}
