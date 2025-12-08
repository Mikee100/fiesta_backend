import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { AiService } from '../ai/ai.service';

@Injectable()
export class MessagesService {
  /**
   * Public method to get customer by ID
   */
  async getCustomerById(customerId: string) {
    return this.prisma.customer.findUnique({ where: { id: customerId } });
  }
  /**
   * Static method for intent classification (no dependencies required)
   */
  static classifyIntentSimple(content: string): string {
    const lower = content.toLowerCase();
    // Greeting intent
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('good morning') || lower.includes('good afternoon') || lower.includes('good evening')) {
      return 'greeting';
    }
    // Reschedule intent
    if (/(reschedul\w*|change|move|shift|postpone|adjust|modify|update).*(date|time|booking|appointment|slot)/i.test(lower) ||
        /can i reschedul\w*/i.test(lower) ||
        /i want to (change|move|shift|postpone|adjust|modify|update) (my|the)? (date|time|booking|appointment|slot)/i.test(lower)) {
      return 'reschedule';
    }
    // Booking inquiry intent
    const bookingInquiryPatterns = [
      /\b(book|booking|appointment|schedule|reserve|slot|meeting|session|consultation)\b/i,
      /i want to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /can i (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /i'd like to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /help me (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /want to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /need to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /schedule an appointment/i,
      /set up an appointment/i,
      /make a booking/i,
      /reserve a slot/i,
      /can i come/i,
      /can i visit/i,
      /can i get a slot/i,
      /can i get an appointment/i,
    ];
    if (bookingInquiryPatterns.some(pattern => pattern.test(lower))) {
      return 'booking_inquiry';
    }
    // FAQ intent
    if (lower.includes('help') || lower.includes('question') || lower.includes('info') || lower.includes('what') || lower.includes('how') || lower.includes('price') || lower.includes('cost') || lower.includes('hours') || lower.includes('location')) {
      return 'faq';
    }
    // Confirmation intent
    if (lower.includes('confirm') || lower.includes('ok') || lower.includes('sure') || lower.includes('yes please') || lower.includes('sounds good')) {
      return 'confirmation';
    }
    // General intent
    return 'general';
  }
  constructor(
    private prisma: PrismaService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
    @Inject(forwardRef(() => AiService)) private aiService: AiService,
  ) { }

  async create(createMessageDto: CreateMessageDto) {
    const message = await this.prisma.message.create({
      data: createMessageDto,
    });

    return message;
  }

  async findAll() {
    return this.prisma.message.findMany({
      include: { customer: true },
    });
  }

  async countMessages(args: any) {
    return this.prisma.message.count(args);
  }

  async findByCustomer(customerId: string) {
    return this.prisma.message.findMany({
      where: { customerId },
      include: { customer: true },
    });
  }

  async findOne(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  async findByExternalId(externalId: string) {
    return this.prisma.message.findUnique({
      where: { externalId },
      include: { customer: true },
    });
  }

  async classifyIntent(content: string, history: string[] = []): Promise<string> {
    console.log('Classifying intent for content:', content, 'with history length:', history.length);

    // Use AI for context-aware classification if history is available
    if (history.length > 0) {
      try {
        const historyContext = history.slice(-5).join('\n'); // Last 5 messages for context
        const prompt = `Classify the intent of the following user message based on the conversation history. Intent definitions:
- greeting: hello, hi, good morning, etc.
- booking_inquiry: asking about availability, services, booking process, or making general booking requests
- booking_details: providing specific details for a booking like service type, date/time, or confirming a time slot (e.g., "10 am is good", "yes", "that works")
- booking_update: requesting to change or reschedule an existing booking
- faq: questions about business info like hours, location, prices
- confirmation: agreeing to or confirming something (yes, ok, sounds good)
- general: other casual conversation

History:
${historyContext}

Message: ${content}

Respond with only the intent (e.g., booking_details).`;

        const response = await this.aiService.generateResponse(prompt, 'dummy', {} as any, []);
        // Extract intent from AI response
        const aiIntent = response.trim().toLowerCase();
        if (['greeting', 'booking_inquiry', 'booking_details', 'booking_update', 'faq', 'confirmation', 'general'].includes(aiIntent)) {
          console.log('AI classified intent:', aiIntent);
          return aiIntent;
        } else {
          console.log('AI classification invalid, falling back to keywords');
        }
      } catch (error) {
        console.error('AI classification failed, falling back to keywords:', error);
      }
    }

    // Fallback to enhanced keyword-based classification
    const lower = content.toLowerCase();
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('good morning') || lower.includes('good afternoon') || lower.includes('good evening')) {
      console.log('Classified as greeting');
      return 'greeting';
    }
    // Reschedule intent
    if (/(reschedul\w*|change|move|shift|postpone|adjust|modify|update).*(date|time|booking|appointment|slot)/i.test(lower) ||
        /can i reschedul\w*/i.test(lower) ||
        /i want to (change|move|shift|postpone|adjust|modify|update) (my|the)? (date|time|booking|appointment|slot)/i.test(lower)) {
      console.log('Classified as reschedule');
      return 'reschedule';
    }
    // Booking inquiry intent
    // Enhanced booking inquiry detection
    const bookingInquiryPatterns = [
      /\b(book|booking|appointment|schedule|reserve|slot|meeting|session|consultation)\b/i,
      /i want to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /can i (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /i'd like to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /help me (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /want to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /need to (book|schedule|reserve|set up|make) (an|a)? (appointment|booking|session|meeting)/i,
      /schedule an appointment/i,
      /set up an appointment/i,
      /make a booking/i,
      /reserve a slot/i,
      /can i come/i,
      /can i visit/i,
      /can i get a slot/i,
      /can i get an appointment/i,
    ];
    if (bookingInquiryPatterns.some(pattern => pattern.test(lower))) {
      console.log('Classified as booking_inquiry');
      return 'booking_inquiry';
    }
    // Removed old salon service keywords. Use AI for all Fiesta House Maternity booking details.
    if (lower.includes('help') || lower.includes('question') || lower.includes('info') || lower.includes('what') || lower.includes('how') || lower.includes('price') || lower.includes('cost') || lower.includes('hours') || lower.includes('location')) {
      console.log('Classified as faq');
      return 'faq';
    }
    if (lower.includes('confirm') || lower.includes('ok') || lower.includes('sure') || lower.includes('yes please') || lower.includes('sounds good')) {
      console.log('Classified as confirmation');
      return 'confirmation';
    }
    console.log('Classified as general');
    return 'general';
  }

  async sendOutboundMessage(customerId: string, content: string, platform: string) {
    // Create outbound message in DB
    const message = await this.create({
      content,
      platform,
      direction: 'outbound',
      customerId,
    });

    // If WhatsApp, send via WhatsApp API
    if (platform === 'whatsapp') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
      });
      if ((customer as any)?.whatsappId) {
        // Inject WhatsappService here or use event
        // For now, we'll handle in processor
      }
    }

    return message;
  }

  /**
   * Get conversation history for AI context
   * Returns last N messages formatted for GPT-4o
   */
  async getConversationHistory(customerId: string, limit = 10): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await this.prisma.message.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        content: true,
        direction: true,
        createdAt: true,
      },
    });

    // Reverse to get chronological order (oldest first)
    const chronological = messages.reverse();

    // Format for GPT-4o
    return chronological.map(msg => ({
      role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    }));
  }

  /**
   * Get enriched conversation context for AI
   * Includes history + customer profile + booking state
   */
  async getEnrichedContext(customerId: string) {
    const [history, customer, bookingDraft] = await Promise.all([
      this.getConversationHistory(customerId, 10),
      this.prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          bookings: {
            where: { status: { in: ['confirmed', 'completed'] } },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
      }),
      this.prisma.bookingDraft.findUnique({
        where: { customerId },
      }),
    ]);

    return {
      history,
      customer: {
        name: customer?.name,
        totalBookings: customer?.bookings?.length || 0,
        recentBookings: customer?.bookings || [], // Pass all recent bookings
        isReturning: (customer?.bookings?.length || 0) > 0,
      },
      bookingDraft,
    };
  }
}
