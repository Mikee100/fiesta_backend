
// src/modules/ai/ai.service.ts
import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import axios from 'axios';
import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { MessagesService } from '../messages/messages.service';
import { EscalationService } from '../escalation/escalation.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../../websockets/websocket.gateway';

// Utility to extract model version from OpenAI model string
function extractModelVersion(model: string): string {
  if (!model) return '';
  const match = model.match(/(gpt-[^\s]+)/);
  return match ? match[1] : model;
}

type HistoryMsg = { role: 'user' | 'assistant'; content: string };

/**
 * Improved AiService (Option A)
 *
 * - Safer Pinecone initialization (validates envs + sanitizes common user mistakes)
 * - DB-only fallback if Pinecone is unavailable (so seeding still works)
 * - Guards around every Pinecone call to avoid crashing the process
 * - Better logs / actionable error messages
 * - Preserves existing booking / FAQ / extractor logic
 *
 * IMPORTANT ENV VARS (examples)
 * - OPENAI_API_KEY
 * - OPENAI_EMBEDDING_MODEL (default text-embedding-3-small)
 * - OPENAI_CHAT_MODEL (default gpt-4o)
 *
 * Pinecone (two supported ways):
 * 1) Using environment (recommended old-style regional name)
 *    PINECONE_API_KEY="pcsk_xxx"
 *    PINECONE_ENVIRONMENT="us-east-1"         <-- short region, NO https://
 *    PINECONE_INDEX_NAME="ai-business"
 *
 * 2) If you have a full index host URL (serverless style), set:
 *    PINECONE_API_KEY="pcsk_xxx"
 *    PINECONE_INDEX_NAME="ai-business"
 *    PINECONE_HOST="https://ai-business-codn1vq.svc.aped-4627-b74a.pinecone.io"
 *
 * Note: Do NOT set PINECONE_ENVIRONMENT to a full URL (e.g., do NOT set it to PINECONE_HOST).
 */
import { PackageInquiryStrategy } from './strategies/package-inquiry.strategy';
import { BookingStrategy } from './strategies/booking.strategy';
import { FaqStrategy } from './strategies/faq.strategy';
import { ResponseStrategy } from './strategies/response-strategy.interface';

// Token counting with tiktoken (optional - falls back to estimation if not available)
let encoding_for_model: any;
let get_encoding: any;
try {
  const tiktoken = require('tiktoken');
  encoding_for_model = tiktoken.encoding_for_model;
  get_encoding = tiktoken.get_encoding;
} catch (error) {
  // tiktoken not installed - will use fallback estimation
  encoding_for_model = null;
  get_encoding = null;
}

// Learning AI Services
import { CustomerMemoryService } from './services/customer-memory.service';
import { ConversationLearningService } from './services/conversation-learning.service';
import { DomainExpertiseService } from './services/domain-expertise.service';
import { AdvancedIntentService } from './services/advanced-intent.service';

import { PersonalizationService } from './services/personalization.service';
import { FeedbackLoopService } from './services/feedback-loop.service';
import { PredictiveAnalyticsService } from './services/predictive-analytics.service';




@Injectable()
export class AiService {
    // Extracts date and time from text (stub)
    async extractDateTime(text: string): Promise<Date | null> {
      // Use chrono-node for parsing
      const results = chrono.parse(text);
      if (results.length > 0 && results[0].start) {
        return results[0].start.date();
      }
      return null;
    }

    // Helper to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
    private getOrdinalSuffix(day: number): string {
      const j = day % 10;
      const k = day % 100;
      if (j === 1 && k !== 11) return 'st';
      if (j === 2 && k !== 12) return 'nd';
      if (j === 3 && k !== 13) return 'rd';
      return 'th';
    }
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private pinecone: Pinecone | null = null;
  private index: any = null;

  private strategies: ResponseStrategy[] = [];

  /**
   * Formats package details for display in context or messages.
   * @param pkg The package object from the database.
   * @param includeFeatures Whether to include features in the output.
   * @returns A formatted string describing the package.
   */
  private formatPackageDetails(pkg: any, includeFeatures = true): string {
    let details = `📦 *${pkg.name}* - KES ${pkg.price}`;
    
    if (!includeFeatures) {
      return details; // Just name and price for summary lists
    }
    
    // Add duration if available
    if (pkg.duration) {
      details += `\n⏱️ Duration: ${pkg.duration}`;
    }
    
    // Add deposit information
    if (pkg.deposit) {
      details += `\n💰 Deposit: KES ${pkg.deposit}`;
    }
    
    // Build features list
    const features: string[] = [];
    if (pkg.images) features.push(`• ${pkg.images} soft copy image${pkg.images !== 1 ? 's' : ''}`);
    if (pkg.makeup) features.push(`• Professional makeup`);
    if (pkg.outfits) features.push(`• ${pkg.outfits} outfit change${pkg.outfits > 1 ? 's' : ''}`);
    if (pkg.styling) features.push(`• Professional styling`);
    if (pkg.wig) features.push(`• Styled wig`);
    if (pkg.balloonBackdrop) features.push(`• Customized balloon backdrop`);
    if (pkg.photobook) {
      const size = pkg.photobookSize ? ` (${pkg.photobookSize})` : '';
      features.push(`• Photobook${size}`);
    }
    if (pkg.mount) features.push(`• A3 mount`);
    
    if (features.length > 0) {
      details += `\n\n✨ What's included:\n${features.join('\n')}`;
    }
    
    // Add notes if available
    if (pkg.notes) {
      details += `\n\n📝 ${pkg.notes}`;
    }
    
    return details;
  }



  // Models (override with env)
  private readonly embeddingModel: string;
  private readonly extractorModel: string;
  private readonly chatModel: string;
  
  // Retry configuration
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000; // 1 second
  private readonly maxRetryDelay = 10000; // 10 seconds
  // Model fallback chain: try primary model, then cheaper/faster models
  private readonly chatModelFallbackChain = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
  
  // Token counting configuration
  private readonly maxContextTokens = 8000; // Safe limit for gpt-4o (128k context, but we keep buffer)
  private readonly summaryThreshold = 4000; // Start summarizing when history exceeds this
  private tokenEncoding: any = null; // Lazy-loaded tiktoken encoding

  // Studio timezone
  private readonly studioTz = 'Africa/Nairobi';
  // How many history turns to send to the model
  private readonly historyLimit = 6;

  // Rate limiting & cost control
  private readonly maxTokensPerDay = 100000;
  private tokenUsageCache = new Map<string, { count: number; resetTime: Date }>();

  // Package caching
  private packageCache: { data: any[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Semantic cache for knowledge base queries
  private semanticCache = new Map<string, { results: any[]; timestamp: number }>();
  private readonly SEMANTIC_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Fixed business name and location string for responses
  private readonly businessName = 'Fiesta House Attire maternity photoshoot studio';
  private readonly businessLocation = 'Our studio is located at 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor. We look forward to welcoming you! 💖';
  private readonly businessWebsite = 'https://fiestahouseattire.com/';
  private readonly customerCarePhone = '0720 111928';
  private readonly customerCareEmail = 'info@fiestahouseattire.com';
  private readonly businessHours = 'Monday-Saturday: 9:00 AM - 6:00 PM';

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private circuitBreaker: CircuitBreakerService,
    // Learning AI Services - Required for proper learning integration (must come before optional params)
    private customerMemory: CustomerMemoryService,
    private conversationLearning: ConversationLearningService,
    private domainExpertise: DomainExpertiseService,
    private advancedIntent: AdvancedIntentService,
    private personalization: PersonalizationService,
    private feedbackLoop: FeedbackLoopService,
    private predictiveAnalytics: PredictiveAnalyticsService,
    // Optional services (must come after required params)
    @Inject(forwardRef(() => BookingsService)) @Optional() private bookingsService?: BookingsService,
    @Optional() private messagesService?: MessagesService,
    @Optional() private escalationService?: EscalationService,
    @InjectQueue('aiQueue') private aiQueue?: Queue,
    @Optional() private notificationsService?: NotificationsService,
    @Inject(forwardRef(() => WebsocketGateway)) @Optional() private websocketGateway?: WebsocketGateway,
  ) {
    // OpenAI client
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });

    // Models
    this.embeddingModel = this.configService.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    this.extractorModel = this.configService.get<string>('OPENAI_EXTRACTOR_MODEL', 'gpt-4o');
    this.chatModel = this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o');

    // Initialize Pinecone safely (doesn't throw if misconfigured)
    this.initPineconeSafely();

    // Register strategies in priority order (higher priority runs first)
    // FAQ strategy runs first to catch all FAQ questions before booking
    this.strategies = [
      new FaqStrategy(),
      new PackageInquiryStrategy(),
      new BookingStrategy(),
    ];
    
    // Sort by priority (descending) to ensure correct execution order
    this.strategies.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Initialize token encoding (lazy-loaded on first use)
    this.initializeTokenEncoding();
  }

  /**
   * Initialize tiktoken encoding for accurate token counting
   * Falls back to cl100k_base if model-specific encoding not available
   */
  private initializeTokenEncoding() {
    if (!encoding_for_model || !get_encoding) {
      this.logger.warn('[TOKEN] tiktoken not installed - using character-based estimation. Install with: npm install tiktoken');
      this.tokenEncoding = null;
      return;
    }

    try {
      // Try to get model-specific encoding
      this.tokenEncoding = encoding_for_model(this.chatModel as any);
      this.logger.log(`[TOKEN] Initialized encoding for model: ${this.chatModel}`);
    } catch (error) {
      // Fallback to cl100k_base (used by gpt-4, gpt-3.5-turbo)
      try {
        this.tokenEncoding = get_encoding('cl100k_base');
        this.logger.warn(`[TOKEN] Using fallback encoding cl100k_base (model ${this.chatModel} not found)`);
      } catch (fallbackError) {
        this.logger.error('[TOKEN] Failed to initialize token encoding, will use character-based estimation', fallbackError);
        this.tokenEncoding = null;
      }
    }
  }

  /**
   * Check if AI response mentions handing to team/admin and create escalation if needed
   */
  private async checkAndEscalateIfHandoffMentioned(
    responseText: string,
    customerId: string,
    originalMessage: string,
    history: HistoryMsg[]
  ): Promise<void> {
    // Patterns that indicate AI is handing off to team/admin
    const handoffPatterns = [
      /(connect|hand|refer|transfer|escalat).*(you|customer).*(team|admin|staff|support|representative|agent|human)/i,
      /(team|admin|staff|support|representative|agent).*(will|can|has been|has).*(contact|reach|call|assist|help|notif)/i,
      /(notif|alert|inform).*(team|admin|staff|support)/i,
      /(handed|referred|transferred|escalated).*(to|over to).*(team|admin|staff|support)/i,
      /(I've|I have|I'll|I will).*(notif|alert|inform|contact|connect).*(team|admin|staff|support)/i,
    ];

    const mentionsHandoff = handoffPatterns.some(pattern => pattern.test(responseText));

    if (mentionsHandoff) {
      // Check if escalation already exists for this customer (avoid duplicates)
      const existingEscalation = await this.prisma.escalation.findFirst({
        where: {
          customerId,
          status: 'OPEN',
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000) // Within last 5 minutes
          }
        }
      });

      if (!existingEscalation) {
        this.logger.log(`[ESCALATION] AI response mentions handoff to team - creating escalation for customer ${customerId}`);
        
        // Determine escalation type based on context
        let escalationType = 'ai_handoff';
        let reason = 'AI mentioned connecting customer with team';
        
        // Check message context to determine type
        const messageLower = originalMessage.toLowerCase();
        if (/(payment|pay|mpesa|transaction|failed|error).*(payment|pay)/i.test(originalMessage)) {
          escalationType = 'payment_issue';
          reason = 'Payment issue - AI mentioned connecting with team';
        } else if (/(package|packages|service).*(issue|problem|help|question)/i.test(originalMessage)) {
          escalationType = 'package_issue';
          reason = 'Package issue - AI mentioned connecting with team';
        } else if (/(reschedule|rescheduling|change.*date|move.*appointment)/i.test(originalMessage)) {
          escalationType = 'reschedule_request';
          reason = 'Rescheduling request - AI mentioned connecting with team';
        } else if (/(booking|book|appointment).*(issue|problem|help|question)/i.test(originalMessage)) {
          escalationType = 'booking_issue';
          reason = 'Booking issue - AI mentioned connecting with team';
        }

        // Create escalation
        if (this.escalationService) {
          try {
            await this.escalationService.createEscalation(
              customerId,
              reason,
              escalationType,
              {
                originalMessage,
                aiResponse: responseText,
                detectedFrom: 'ai_response_handoff_mention',
                conversationContext: history.slice(-5) // Last 5 messages for context
              }
            );
            this.logger.log(`[ESCALATION] Created escalation from AI handoff mention for customer ${customerId}`);
          } catch (error) {
            this.logger.error(`[ESCALATION] Failed to create escalation from handoff mention: ${error.message}`);
          }
        }
      }
    }
  }

  /**
   * Create an admin alert when AI cannot handle a request
   * Made public so strategies can call it
   */
  async createEscalationAlert(
    customerId: string,
    type: 'reschedule_request' | 'ai_escalation',
    title: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    try {
      if (this.notificationsService) {
        // Get customer info for the alert
        const customer = await this.prisma.customer.findUnique({
          where: { id: customerId },
          include: {
            bookings: {
              where: { status: 'confirmed' },
              orderBy: { dateTime: 'asc' },
              take: 1,
            },
          },
        });

        const customerName = customer?.name?.replace(/^WhatsApp User\s+/i, '') || customer?.phone || 'Unknown';
        const bookingInfo = customer?.bookings?.[0]
          ? {
              bookingId: customer.bookings[0].id,
              service: customer.bookings[0].service,
              dateTime: customer.bookings[0].dateTime,
              recipientName: customer.bookings[0].recipientName,
            }
          : null;

        await this.notificationsService.createNotification({
          type,
          title,
          message,
          metadata: {
            customerId,
            customerName,
            customerPhone: customer?.phone || customer?.whatsappId,
            ...bookingInfo,
            ...metadata,
          },
        });

        this.logger.log(`[ESCALATION] Created admin alert: ${type} for customer ${customerId}`);
      }
    } catch (error) {
      this.logger.error(`[ESCALATION] Failed to create admin alert: ${error.message}`, error);
      // Don't throw - alert creation failure shouldn't break the flow
    }
  }

  /**
   * Check for mentions of bringing external people or items and create session notes
   * This runs for ALL messages to ensure nothing is missed
   */
  private async checkAndCreateSessionNote(
    message: string,
    customerId: string,
    enrichedContext?: any,
    history?: HistoryMsg[]
  ): Promise<void> {
    try {
      const lowerMessage = message.toLowerCase();
      
      // Comprehensive patterns for external people/services
      // Includes variations: "come with", "bringing", "bring", "have", etc.
      const externalPeoplePatterns = [
        /(can i|i will|i'm|i am|i'll|will i).*(come|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(photographer|photography|photo|shoot|photographer|photographer|photographer)/i,
        /(can i|i will|i'm|i am|i'll|will i).*(come|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(makeup|mua|makeup artist|make-up artist|make up artist)/i,
        /(can i|i will|i'm|i am|i'll|will i).*(come|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(videographer|video|videography)/i,
        /(can i|i will|i'm|i am|i'll|will i).*(come|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(stylist|styling|hair|hairstylist|hair stylist)/i,
        /(can i|i will|i'm|i am|i'll|will i).*(come|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(assistant|helper|team|friend|family|partner|husband|spouse)/i,
        /(come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(photographer|photography|photo|shoot|photographer)/i,
        /(come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(makeup|mua|makeup artist|make-up artist|make up artist)/i,
        /(come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(videographer|video|videography)/i,
        /(come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(stylist|styling|hair|hairstylist|hair stylist)/i,
        /(come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(assistant|helper|team|friend|family|partner|husband|spouse)/i,
      ];

      // Patterns for pets/animals
      const petPatterns = [
        /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having|includes|including).*(with|a|an|my|own|personal).*(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/i,
        /(bringing|bring|coming).*(my|own|personal).*(pet|pets|dog|dogs|cat|cats|animal|animals|puppy|puppies|kitten|kittens)/i,
      ];

      // Patterns for items that might conflict with business policies
      const externalItemsPatterns = [
        /(can i|i will|i'm|i am|i'll|will i|come|coming|bring|bringing|brings|have|having).*(with|a|an|my|own|personal).*(camera|equipment|gear|lighting|lights|studio equipment|backdrop|background|props|set)/i,
      ];

      // Check if message mentions external people, items, or pets
      const mentionsExternalPeople = externalPeoplePatterns.some(pattern => pattern.test(message));
      const mentionsExternalItems = externalItemsPatterns.some(pattern => pattern.test(message));
      const mentionsPets = petPatterns.some(pattern => pattern.test(message));

      if (mentionsExternalPeople || mentionsExternalItems || mentionsPets) {
        // Extract what they're bringing
        let itemsMentioned: string[] = [];
        
        // Extract people/services
        if (mentionsExternalPeople) {
          const peopleKeywords = ['photographer', 'photography', 'photo', 'shoot', 'makeup', 'mua', 'makeup artist', 'make-up artist', 'make up artist', 'videographer', 'video', 'videography', 'stylist', 'styling', 'hair', 'hairstylist', 'hair stylist', 'assistant', 'helper', 'team', 'friend', 'family', 'partner', 'husband', 'spouse'];
          for (const keyword of peopleKeywords) {
            if (lowerMessage.includes(keyword)) {
              itemsMentioned.push(keyword);
            }
          }
        }

        // Extract items
        if (mentionsExternalItems) {
          const itemKeywords = ['camera', 'equipment', 'gear', 'lighting', 'lights', 'studio equipment', 'backdrop', 'background', 'props', 'set'];
          for (const keyword of itemKeywords) {
            if (lowerMessage.includes(keyword)) {
              itemsMentioned.push(keyword);
            }
          }
        }

        // Extract pets/animals
        if (mentionsPets) {
          const petKeywords = ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'animal', 'animals', 'puppy', 'puppies', 'kitten', 'kittens'];
          for (const keyword of petKeywords) {
            if (lowerMessage.includes(keyword)) {
              itemsMentioned.push(keyword);
            }
          }
        }

        // Remove duplicates and format
        itemsMentioned = [...new Set(itemsMentioned)];
        
        if (itemsMentioned.length === 0) {
          // If we couldn't extract specific items, use a generic description
          itemsMentioned = [mentionsExternalPeople ? 'external people' : 'external items'];
        }

        const itemsList = itemsMentioned.map(item => item.charAt(0).toUpperCase() + item.slice(1)).join(', ');
        
        // Get customer and booking info
        const customer = enrichedContext?.customer;
        const upcomingBooking = enrichedContext?.customer?.recentBookings?.[0] || 
                               (customer?.bookings && customer.bookings.length > 0 ? customer.bookings[0] : null);
        
        // Determine note type - prioritize pets as external_items, then people, then items
        const noteType = mentionsPets ? 'external_items' : (mentionsExternalPeople ? 'external_people' : 'external_items');

        // Check if a similar session note already exists (avoid duplicates)
        const recentNote = await this.prisma.customerSessionNote.findFirst({
          where: {
            customerId,
            type: noteType,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Only create if no recent similar note exists
        if (!recentNote || recentNote.items.join(', ').toLowerCase() !== itemsMentioned.join(', ').toLowerCase()) {
          // Get platform from the most recent message for this customer
          let platform = 'unknown';
          try {
            const recentMessage = await this.prisma.message.findFirst({
              where: { customerId },
              orderBy: { createdAt: 'desc' },
              select: { platform: true },
            });
            platform = recentMessage?.platform || 'unknown';
          } catch (error) {
            this.logger.warn(`[SESSION NOTE] Could not get platform for customer ${customerId}: ${error.message}`);
          }

          // Save session note to database
          const sessionNote = await this.prisma.customerSessionNote.create({
            data: {
              customerId,
              type: noteType,
              items: itemsMentioned,
              description: `Customer mentioned bringing: ${itemsList}. Original message: "${message}"`,
              bookingId: upcomingBooking?.id,
              sourceMessage: message,
              platform: platform,
              status: 'pending',
            },
          });

          this.logger.log(`[SESSION NOTE] Created session note for customer ${customerId}: ${itemsList}`);

          // Create admin notification
          if (this.notificationsService) {
            const customerData = await this.prisma.customer.findUnique({
              where: { id: customerId },
              select: {
                name: true,
                phone: true,
                whatsappId: true,
              },
            });

            const customerName = customerData?.name?.replace(/^WhatsApp User\s+/i, '') || customerData?.phone || 'Unknown';
            
            await this.notificationsService.createNotification({
              type: 'ai_escalation',
              title: 'Customer Bringing External People/Items',
              message: `${customerName} mentioned bringing ${itemsList} to their session. Please review the session notes.`,
              metadata: {
                customerId,
                customerName,
                customerPhone: customerData?.phone || customerData?.whatsappId,
                sessionNoteId: sessionNote.id,
                itemsMentioned: itemsMentioned,
                itemsList: itemsList,
                originalMessage: message,
                bookingId: upcomingBooking?.id,
                bookingService: upcomingBooking?.service,
                bookingDateTime: upcomingBooking?.dateTime,
                requiresAttention: true,
              },
            });

            this.logger.log(`[SESSION NOTE] Created admin notification for session note: ${sessionNote.id}`);
          }
        } else {
          this.logger.debug(`[SESSION NOTE] Similar note already exists for customer ${customerId}, skipping duplicate`);
        }
      }
    } catch (error) {
      this.logger.error(`[SESSION NOTE] Failed to check/create session note: ${error.message}`, error);
      // Don't throw - session note creation failure shouldn't break the flow
    }
  }

  /**
   * Initialize Pinecone but with robust validation and helpful logs.
   * - If PINECONE_HOST is provided, treat that as the full host
   * - If PINECONE_ENVIRONMENT is a short token (no https), pass it as environment
   * - If misconfigured (https in environment, etc.) we log a clear message and disable Pinecone
   */
  private initPineconeSafely() {
    const apiKey = this.configService.get<string>('PINECONE_API_KEY');
    const indexName = this.configService.get<string>('PINECONE_INDEX_NAME');
    let env = this.configService.get<string>('PINECONE_ENVIRONMENT');
    const host = this.configService.get<string>('PINECONE_HOST');

    if (!apiKey || !indexName) {
      this.logger.warn('Pinecone disabled: missing PINECONE_API_KEY or PINECONE_INDEX_NAME in env.');
      this.pinecone = null;
      this.index = null;
      return;
    }

    // If user accidentally put a full URL in PINECONE_ENVIRONMENT, treat it as a host and warn
    if (env && env.startsWith('http')) {
      this.logger.warn('PINECONE_ENVIRONMENT contains a URL. Treating it as PINECONE_HOST. Please set PINECONE_HOST instead and set PINECONE_ENVIRONMENT to a short region (e.g., us-east-1) or leave it unset.');
      // prefer explicit host variable but if not present, use env value as host
      if (!host) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        (this.configService as any).PINECONE_HOST = env;
      }
      env = undefined;
    }

    // Create client: prefer environment (short region) if present; otherwise try host
    try {
      if (env && !env.startsWith('http')) {
        // Standard behavior: environment string like "us-east-1"
        this.pinecone = new Pinecone({
          apiKey,
          environment: env,
        } as any); // cast since some versions accept environment param
        this.index = this.pinecone.index(indexName);
        this.logger.log(`Pinecone initialized with environment="${env}", index="${indexName}".`);
        return;
      }

      if (host) {
        // If a host is provided, pass it into the SDK index factory if the SDK supports it.
        // We'll try both common patterns: index(name, host) or Index(name) with baseURL config.
        // This is defensive: if the SDK version you have uses a different signature, the try/catch will handle it.
        this.pinecone = new Pinecone({ apiKey } as any);

        try {
          // some SDK variants let you pass host as second arg to index()
          this.index = this.pinecone.index(indexName);
          this.logger.log(`Pinecone initialized with HOST="${host}", index="${indexName}".`);
          return;
        } catch (_) {
          // fallback: try to set baseUrl on client (not all versions use this)
          try {
            (this.pinecone as any).baseUrl = host;
            // attempt to create index using the alternate method (Index vs index)
            if (typeof (this.pinecone as any).Index === 'function') {
              this.index = (this.pinecone as any).Index(indexName);
            } else {
              this.index = this.pinecone.index(indexName);
            }
            this.logger.log(`Pinecone initialized (fallback) with HOST="${host}", index="${indexName}".`);
            return;
          } catch (e2) {
            // Let outer catch handle it
            throw e2;
          }
        }
      }

      // If we reach here, environment was unset or invalid and host was not provided
      this.logger.warn('Pinecone not initialized: set PINECONE_ENVIRONMENT (short region) or PINECONE_HOST (full index host URL). Continuing in DB-only mode.');
      this.pinecone = null;
      this.index = null;
    } catch (err) {
      // Do NOT crash the whole service if Pinecone is misconfigured/unreachable.
      // Log details and continue with DB-only mode.
      this.logger.warn('Pinecone initialization failed. Falling back to DB-only mode. Error:', err as any);
      this.pinecone = null;
      this.index = null;
    }
  }

  /* --------------------------
   * Rate Limiting & Cost Control
   * -------------------------- */
  private async checkRateLimit(customerId: string): Promise<boolean> {
    const usage = this.tokenUsageCache.get(customerId);
    const now = new Date();

    if (!usage || usage.resetTime < now) {
      this.tokenUsageCache.set(customerId, {
        count: 0,
        resetTime: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      });
      return true;
    }

    return usage.count < this.maxTokensPerDay;
  }

  private async trackTokenUsage(customerId: string, tokensUsed: number): Promise<void> {
    // Update in-memory cache
    const usage = this.tokenUsageCache.get(customerId);
    if (usage) {
      usage.count += tokensUsed;
    }

    // Update database
    try {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (customer) {
        const now = new Date();
        const resetNeeded = !customer.tokenResetDate || customer.tokenResetDate < now;

        await this.prisma.customer.update({
          where: { id: customerId },
          data: {
            dailyTokenUsage: resetNeeded ? tokensUsed : customer.dailyTokenUsage + tokensUsed,
            tokenResetDate: resetNeeded ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : customer.tokenResetDate,
            totalTokensUsed: customer.totalTokensUsed + tokensUsed,
          },
        });
      }
    } catch (err) {
      this.logger.warn('Failed to track token usage in database', err);
    }
  }

  /* --------------------------
   * Token Counting & History Pruning (Accurate with tiktoken)
   * -------------------------- */
  
  /**
   * Get accurate token count using tiktoken
   * Falls back to character estimation if tiktoken not available
   */
  private getTokenCount(text: string): number {
    if (!text) return 0;
    
    if (this.tokenEncoding) {
      try {
        return this.tokenEncoding.encode(text).length;
      } catch (error) {
        this.logger.warn('[TOKEN] tiktoken encoding failed, using fallback', error);
      }
    }
    
    // Fallback: rough estimate (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total tokens for messages array
   * Includes overhead for message formatting (~4 tokens per message)
   */
  private calculateTokenCount(messages: any[]): number {
    if (!messages || messages.length === 0) return 0;
    
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += this.getTokenCount(content);
      // Add overhead for message formatting (role, etc.)
      total += 4;
    }
    
    return total;
  }

  /**
   * Intelligent history pruning that preserves important messages
   * - Always keeps recent messages (last 3-4 exchanges)
   * - Preserves system/important messages
   * - Summarizes older messages instead of deleting
   */
  private pruneHistory(history: HistoryMsg[], maxTokens: number = this.maxContextTokens): HistoryMsg[] {
    if (!history || history.length === 0) return [];
    
    const totalTokens = this.calculateTokenCount(history);
    if (totalTokens <= maxTokens) {
      return history;
    }

    // Always keep the most recent messages (last 3-4 exchanges = 6-8 messages)
    const recentMessages = history.slice(-8);
    const recentTokens = this.calculateTokenCount(recentMessages);
    
    // If recent messages alone exceed limit, keep only the most recent
    if (recentTokens > maxTokens) {
      const pruned: HistoryMsg[] = [];
      let tokens = 0;
      
      // Keep messages from the end until we hit the limit
      for (let i = history.length - 1; i >= 0; i--) {
        const msgTokens = this.getTokenCount(history[i].content) + 4;
        if (tokens + msgTokens > maxTokens) break;
        pruned.unshift(history[i]);
        tokens += msgTokens;
      }
      
      this.logger.debug(`[TOKEN] Pruned history: ${history.length} → ${pruned.length} messages (${tokens} tokens)`);
      return pruned;
    }

    // We have room for older messages - check if we should summarize
    const olderMessages = history.slice(0, -8);
    if (olderMessages.length > 0 && totalTokens > this.summaryThreshold) {
      // Summarize older messages instead of deleting
      this.logger.debug(`[TOKEN] History exceeds summary threshold, should summarize older messages`);
      // For now, return recent messages only (summarization will be added next)
      return recentMessages;
    }

    // Keep recent messages + as many older messages as fit
    const pruned: HistoryMsg[] = [...recentMessages];
    let tokens = recentTokens;
    
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const msgTokens = this.getTokenCount(olderMessages[i].content) + 4;
      if (tokens + msgTokens > maxTokens) break;
      pruned.unshift(olderMessages[i]);
      tokens += msgTokens;
    }

    this.logger.debug(`[TOKEN] Pruned history: ${history.length} → ${pruned.length} messages (${tokens}/${maxTokens} tokens)`);
    return pruned;
  }

  /**
   * Generate clarifying question when intent confidence is low
   */
  private generateClarifyingQuestion(intentAnalysis: any, message: string): string | null {
    if (!intentAnalysis || intentAnalysis.confidence >= 0.7) {
      return null;
    }

    const primaryIntent = intentAnalysis.primaryIntent;
    const secondaryIntents = intentAnalysis.secondaryIntents || [];
    
    // If we have multiple possible intents, ask which one
    if (secondaryIntents.length > 0) {
      const possibleIntents = [primaryIntent, ...secondaryIntents].slice(0, 3);
      const intentLabels: Record<string, string> = {
        'booking': 'booking an appointment',
        'faq': 'getting information',
        'package_inquiry': 'learning about packages',
        'price_inquiry': 'checking prices',
        'reschedule': 'rescheduling',
        'cancel': 'cancelling',
      };
      
      const options = possibleIntents
        .map(intent => intentLabels[intent] || intent)
        .filter(Boolean)
        .join(', ');
      
      return `I want to make sure I understand correctly - are you asking about ${options}? 😊`;
    }
    
    // If single intent but low confidence, ask for confirmation
    const intentLabels: Record<string, string> = {
      'booking': 'booking an appointment',
      'faq': 'getting information about our services',
      'package_inquiry': 'learning about our packages',
      'price_inquiry': 'checking our prices',
      'reschedule': 'rescheduling your booking',
      'cancel': 'cancelling your booking',
    };
    
    const label = intentLabels[primaryIntent] || primaryIntent;
    return `Just to make sure I understand - are you looking to ${label}? 😊`;
  }

  /**
   * Summarize old conversation messages to preserve context
   * This allows us to keep important information without using too many tokens
   */
  private async summarizeOldMessages(oldMessages: HistoryMsg[]): Promise<string> {
    if (!oldMessages || oldMessages.length === 0) return '';
    
    try {
      // Create a summary prompt
      const conversationText = oldMessages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');
      
      const summaryPrompt = `Summarize this conversation history, preserving:
- Customer preferences and decisions
- Booking details discussed
- Key questions asked and answered
- Important context for continuing the conversation

Conversation:
${conversationText.substring(0, 2000)}...`;

      const summary = await this.retryOpenAICall(
        async (model = 'gpt-4o-mini') => { // Use cheaper model for summarization
          return await this.openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: summaryPrompt }],
            max_tokens: 200,
            temperature: 0.3,
          });
        },
        'summarizeOldMessages',
        true
      );

      const summaryText = summary.choices[0].message.content?.trim() || '';
      this.logger.debug(`[TOKEN] Summarized ${oldMessages.length} messages into ${this.getTokenCount(summaryText)} tokens`);
      return summaryText;
    } catch (error) {
      this.logger.warn('[TOKEN] Failed to summarize old messages', error);
      return ''; // Return empty if summarization fails
    }
  }

  /* --------------------------
   * Retry Logic with Exponential Backoff & Model Fallback
   * -------------------------- */
  
  /**
   * Retry OpenAI API call with exponential backoff and model fallback chain
   * @param operation OpenAI API call function
   * @param operationName Name for logging
   * @param useModelFallback Whether to try fallback models on failure
   * @returns API response
   */
  private async retryOpenAICall<T>(
    operation: (model?: string) => Promise<T>,
    operationName: string,
    useModelFallback: boolean = true
  ): Promise<T> {
    const modelsToTry = useModelFallback ? this.chatModelFallbackChain : [this.chatModel];
    let lastError: any;

    for (const model of modelsToTry) {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          this.logger.debug(`[RETRY] ${operationName} - Attempt ${attempt}/${this.maxRetries} with model: ${model}`);
          return await operation(model);
        } catch (error: any) {
          lastError = error;
          const errorCode = error?.code || error?.response?.status || error?.status;
          const errorMessage = error?.message || String(error);

          this.logger.warn(
            `[RETRY] ${operationName} failed on attempt ${attempt}/${this.maxRetries} with model ${model}: ${errorCode} - ${errorMessage}`
          );

          // Don't retry on certain errors (quota, auth, invalid request)
          if (errorCode === 'insufficient_quota' || 
              errorCode === 'invalid_api_key' || 
              errorCode === 'invalid_request_error') {
            this.logger.error(`[RETRY] Non-retryable error: ${errorCode}`);
            throw error;
          }

          // If rate limited, wait longer
          if (errorCode === 'rate_limit_exceeded') {
            const retryAfter = error?.response?.headers?.['retry-after'] || 
                             error?.headers?.['retry-after'] || 
                             Math.min(this.baseRetryDelay * Math.pow(2, attempt - 1), this.maxRetryDelay);
            this.logger.warn(`[RETRY] Rate limited, waiting ${retryAfter}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            continue; // Retry same model
          }

          // For other errors, use exponential backoff
          if (attempt < this.maxRetries) {
            const delay = Math.min(
              this.baseRetryDelay * Math.pow(2, attempt - 1),
              this.maxRetryDelay
            );
            this.logger.debug(`[RETRY] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // If we've exhausted retries for this model and have more models to try
      if (modelsToTry.indexOf(model) < modelsToTry.length - 1) {
        this.logger.warn(`[RETRY] Model ${model} failed, trying fallback model...`);
        continue; // Try next model in fallback chain
      }
    }

    // All models and retries exhausted
    this.logger.error(`[RETRY] ${operationName} failed after ${this.maxRetries} attempts with all models`);
    throw lastError;
  }

  /**
   * Handle OpenAI API failures with graceful fallback messages
   */
  private async handleOpenAIFailure(error: any, customerId: string): Promise<string> {
    this.logger.error('OpenAI API failure', error);

    const errorCode = error?.code || error?.response?.status || error?.status;

    // Queue for async retry (if queue available)
    if (this.aiQueue) {
      try {
        await this.aiQueue.add('retry-message', { 
          customerId, 
          error: error.message,
          timestamp: Date.now()
        });
      } catch (queueError) {
        this.logger.warn('[RETRY] Failed to queue retry message', queueError);
      }
    }

    // Return graceful fallback based on error type
    if (errorCode === 'insufficient_quota') {
      await this.escalationService?.createEscalation(
        customerId,
        'AI service quota exceeded - immediate attention required'
      );
      return "I'm experiencing technical difficulties right now. Our team has been notified and will assist you shortly! 💖";
    }

    if (errorCode === 'rate_limit_exceeded') {
      return "I'm receiving a lot of messages right now. Please give me a moment and try again in a few seconds! 💕";
    }

    if (errorCode === 'invalid_api_key' || errorCode === 401) {
      this.logger.error('[CRITICAL] Invalid OpenAI API key - check configuration');
      await this.escalationService?.createEscalation(
        customerId,
        'AI service configuration error - critical'
      );
      return "I'm experiencing a configuration issue. Our team has been notified and will fix this immediately! 💖";
    }

    if (errorCode === 'context_length_exceeded' || errorCode === 400) {
      return "Your message is quite long. Could you break it into smaller parts? That would help me assist you better! 😊";
    }

    // Network/timeout errors
    if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' || errorCode === 'timeout') {
      return "I'm having trouble connecting right now. Please try again in a moment! 💕";
    }

    // Generic fallback
    return "I'm having trouble processing that right now. Could you rephrase it, or would you like to speak with someone from our team? 💕";
  }

  /* --------------------------
   * Sentiment Analysis for Escalation
   * -------------------------- */
  private async detectFrustration(message: string, history: HistoryMsg[]): Promise<boolean> {
    const frustrationKeywords = [
      'frustrated', 'angry', 'annoyed', 'disappointed',
      'terrible', 'worst', 'horrible', 'ridiculous',
      'useless', 'stupid', 'waste', 'pathetic'
    ];

    const repeatedQuestions = history
      .filter(h => h.role === 'user')
      .slice(-3)
      .map(h => h.content.toLowerCase());

    const hasRepetition = new Set(repeatedQuestions).size < repeatedQuestions.length;
    const hasFrustrationWords = frustrationKeywords.some(kw =>
      message.toLowerCase().includes(kw)
    );
    return hasRepetition || hasFrustrationWords;
  }

  /* --------------------------
   * Package Caching
   * -------------------------- */
  public async getCachedPackages(): Promise<any[]> {
    const now = Date.now();

    if (this.packageCache && (now - this.packageCache.timestamp) < this.CACHE_TTL) {
      return this.packageCache.data;
    }

    // Fetch packages from the database
    const packages = await this.prisma.package.findMany();
    this.packageCache = { data: packages, timestamp: now };

    return packages;
  }

  /* --------------------------
   * Input Validation & Sanitization
   * -------------------------- */
  private sanitizeInput(message: string): string {
    // Remove potential injection attempts
    return message
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim()
      .slice(0, 2000); // Max message length
  }

  /* --------------------------
   * Retry Logic for Database Operations
   * -------------------------- */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`${operationName} failed on attempt ${attempt}/${maxRetries}:`, error);

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          this.logger.debug(`Retrying ${operationName} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`${operationName} failed after ${maxRetries} attempts:`, lastError);
    throw lastError;
  }

  private validatePhoneNumber(phone: string): boolean {
    // Kenyan format: 07XX XXX XXX or +2547XX XXX XXX
    const kenyanPattern = /^(\+254|0)[17]\d{8}$/;
    return kenyanPattern.test(phone.replace(/\s/g, ''));
  }

  /* --------------------------
   * Booking Conflict Detection
   * -------------------------- */
  private async checkBookingConflicts(
    customerId: string, 
    dateTime: Date, 
    excludeBookingId?: string,
    service?: string
  ): Promise<{ conflict: string | null; suggestions?: string[] }> {
    // Get duration for the new booking
    let durationMinutes = 60; // default
    if (service) {
      const pkg = await this.prisma.package.findFirst({ where: { name: service } });
      if (pkg && pkg.duration) {
        // Parse duration string like "1 hr 30 min" or "90 min"
        const hrMatch = pkg.duration.match(/(\d+)\s*hr/i);
        const minMatch = pkg.duration.match(/(\d+)\s*min/i);
        durationMinutes = 0;
        if (hrMatch) durationMinutes += parseInt(hrMatch[1], 10) * 60;
        if (minMatch) durationMinutes += parseInt(minMatch[1], 10);
        if (durationMinutes === 0) durationMinutes = 60; // fallback if parsing fails
      }
    }

    // Calculate the time slot for the new booking
    const newSlotStart = DateTime.fromJSDate(dateTime, { zone: 'utc' });
    const newSlotEnd = newSlotStart.plus({ minutes: durationMinutes });

    // Get all existing bookings for this customer (excluding the one being rescheduled)
    const whereClause: any = {
      customerId,
      status: { in: ['confirmed', 'pending'] },
    };

    if (excludeBookingId) {
      whereClause.id = { not: excludeBookingId };
    }

    const existingBookings = await this.prisma.booking.findMany({
      where: whereClause,
      include: {
        customer: true,
      },
    });

    // Check for actual time overlaps
    const conflictingBookings = existingBookings.filter(booking => {
      const bookingStart = DateTime.fromJSDate(booking.dateTime, { zone: 'utc' });
      const bookingDuration = booking.durationMinutes || 60;
      const bookingEnd = bookingStart.plus({ minutes: bookingDuration });

      // Check if time slots overlap: newSlotStart < bookingEnd && bookingStart < newSlotEnd
      return newSlotStart < bookingEnd && bookingStart < newSlotEnd;
    });

    if (conflictingBookings.length > 0) {
      const conflicting = conflictingBookings[0];
      const existing = DateTime.fromJSDate(conflicting.dateTime).setZone(this.studioTz);
      const conflictMessage = `You already have a booking on ${existing.toFormat('MMM dd')} at ${existing.toFormat('h:mm a')}. Would you like to modify that instead?`;

      // Get available slots for the same day
      const dateStr = DateTime.fromJSDate(dateTime).toISODate();
      const availableSlots = await this.bookingsService.getAvailableSlotsForDate(dateStr);

      return {
        conflict: conflictMessage,
        suggestions: availableSlots.slice(0, 5) // Return up to 5 available slots
      };
    }

    return { conflict: null };
  }

  /* --------------------------
   * Analytics & Tracking
   * -------------------------- */
  async trackConversationMetrics(customerId: string, metrics: {
    intent: string;
    duration: number;
    messagesCount: number;
    resolved: boolean;
  }) {
    try {
      await this.prisma.conversationMetrics.create({
        data: {
          customerId,
          ...metrics,
          timestamp: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn('Failed to track conversation metrics', err);
    }
  }

  /* --------------------------

  /* --------------------------
   * Helper: normalize date/time using chrono + luxon
   * Returns null or { isoUtc, dateOnly, timeOnly }
   * More robust handling + logging for ambiguous dates.
   * -------------------------- */
  public normalizeDateTime(rawDate?: string | null, rawTime?: string | null) {
    if (!rawDate && !rawTime) return null;
    const input = [rawDate, rawTime].filter(Boolean).join(' ');
    try {
      // chrono.parseDate can be ambiguous; attempt common tweaks
      let parsed = chrono.parseDate(input, new Date());
      if (!parsed) {
        // try parsing time-only or date-only variations
        parsed = chrono.parseDate(rawDate ?? rawTime ?? '', new Date());
      }
      if (!parsed) {
        this.logger.warn('normalizeDateTime could not parse input', { rawDate, rawTime });
        return null;
      }
      const dt = DateTime.fromJSDate(parsed).setZone(this.studioTz);
      const isoUtc = dt.toUTC().toISO();
      return { isoUtc, dateOnly: dt.toFormat('yyyy-MM-dd'), timeOnly: dt.toFormat('HH:mm') };
    } catch (err) {
      this.logger.warn('normalizeDateTime failed', err);
      return null;
    }
  }

  /* --------------------------
   * Embeddings & RAG (FAQ)
   * -------------------------- */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const r = await this.retryOpenAICall(
        async () => {
          return await this.openai.embeddings.create({ 
            model: this.embeddingModel, 
            input: text 
          });
        },
        'generateEmbedding',
        false // Embeddings don't need model fallback
      );
      return r.data[0].embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding after retries', error);
      throw error;
    }
  }

  /**
   * Hybrid search: Combines vector similarity + keyword matching for better results
   * Also includes semantic caching to reduce redundant API calls
   */
  async retrieveRelevantDocs(query: string, topK = 3) {
    // Check semantic cache first
    const cacheKey = this.normalizeQueryForCache(query);
    const cached = this.semanticCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.SEMANTIC_CACHE_TTL) {
      this.logger.debug(`[KB] Using cached results for query: "${query.substring(0, 50)}"`);
      return cached.results.slice(0, topK);
    }

    let docs: any[] = [];
    const docMap = new Map<string, any>(); // Use Map to deduplicate and merge scores

    // 1. HYBRID SEARCH: Try both keyword and vector search in parallel
    const [keywordResults, vectorResults] = await Promise.all([
      this.searchByKeywords(query),
      this.searchByVector(query, topK * 2) // Get more results for hybrid scoring
    ]);

    // 2. Merge and boost results that match both methods
    keywordResults.forEach(doc => {
      const existing = docMap.get(doc.id);
      if (existing) {
        // Boost score if found in both keyword and vector search
        existing.score = Math.min(1.0, existing.score * 1.3); // 30% boost for hybrid match
        existing.matchType = 'hybrid';
      } else {
        doc.matchType = 'keyword';
        docMap.set(doc.id, doc);
      }
    });

    vectorResults.forEach(doc => {
      const existing = docMap.get(doc.id);
      if (existing) {
        // Already boosted above
        if (!existing.matchType) existing.matchType = 'hybrid';
      } else {
        doc.matchType = 'vector';
        docMap.set(doc.id, doc);
      }
    });

    docs = Array.from(docMap.values());

    // 3. Fallback: Fuzzy matching if no results
    if (docs.length === 0) {
      this.logger.debug('[KB] No keyword/vector matches - trying fuzzy matching');
      const fuzzyResults = await this.searchByFuzzy(query);
      docs.push(...fuzzyResults);
    }

    // 4. Re-score and rank results
    docs = this.rankAndScoreResults(docs, query);

    // 5. Cache results
    this.semanticCache.set(cacheKey, {
      results: docs,
      timestamp: Date.now()
    });

    // Clean old cache entries (keep cache size reasonable)
    this.cleanSemanticCache();

    // Return top K results
    const finalResults = docs.slice(0, topK);
    this.logger.debug(`[KB] Retrieved ${finalResults.length} docs for query: "${query.substring(0, 50)}"`);
    return finalResults;
  }

  /**
   * Keyword-based search in database
   */
  private async searchByKeywords(query: string): Promise<any[]> {
    const docs: any[] = [];
    try {
      const cleanQuery = query.replace(/[^\w\s]/gi, '').trim();
      if (cleanQuery.length < 3) return docs;

      // Extract important keywords (longer words, exclude common words)
      const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'what', 'when', 'where', 'why', 'how', 'who']);
      const keywords = cleanQuery.split(' ')
        .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
        .slice(0, 5); // Limit to top 5 keywords

      if (keywords.length === 0) return docs;

      // Try exact match first (highest priority)
      const exactMatch = await this.prisma.knowledgeBase.findFirst({
        where: {
          question: { equals: query, mode: 'insensitive' }
        }
      });

      if (exactMatch) {
        docs.push({
          id: exactMatch.id,
          score: 0.98, // Very high score for exact match
          metadata: {
            answer: exactMatch.answer,
            text: exactMatch.question,
            category: exactMatch.category,
            mediaUrls: []
          }
        });
        return docs; // Exact match found, return early
      }

      // Try keyword matching
      const dbMatches = await this.prisma.knowledgeBase.findMany({
        where: {
          OR: keywords.map(keyword => ({
            question: { contains: keyword, mode: 'insensitive' }
          }))
        },
        take: 5
      });

      dbMatches.forEach(f => {
        // Calculate keyword match score
        const questionLower = f.question.toLowerCase();
        const matchedKeywords = keywords.filter(kw => questionLower.includes(kw.toLowerCase())).length;
        const score = 0.7 + (matchedKeywords / keywords.length) * 0.2; // 0.7-0.9 range

        docs.push({
          id: f.id,
          score,
          metadata: {
            answer: f.answer,
            text: f.question,
            category: f.category,
            mediaUrls: []
          }
        });
      });

      this.logger.debug(`[KB] Keyword search found ${docs.length} matches`);
    } catch (err) {
      this.logger.warn('[KB] Keyword search failed', err);
    }

    return docs;
  }

  /**
   * Vector-based semantic search using Pinecone
   */
  private async searchByVector(query: string, topK: number): Promise<any[]> {
    const docs: any[] = [];
    
    if (!this.index) {
      return docs;
    }

    try {
      const vec = await this.generateEmbedding(query);
      const resp = await this.index.query({ 
        vector: vec, 
        topK: Math.min(topK, 10), // Limit to reasonable number
        includeMetadata: true 
      });

      if (resp.matches && resp.matches.length > 0) {
        resp.matches.forEach(match => {
          docs.push({
            id: match.id,
            score: match.score || 0.5, // Use Pinecone's similarity score
            metadata: {
              answer: match.metadata?.answer || match.metadata?.text || '',
              text: match.metadata?.text || match.metadata?.question || '',
              category: match.metadata?.category || '',
              mediaUrls: match.metadata?.mediaUrls || []
            }
          });
        });

        this.logger.debug(`[KB] Vector search found ${docs.length} matches`);
      }
    } catch (err) {
      this.logger.warn('[KB] Vector search failed', err);
    }

    return docs;
  }

  /**
   * Fuzzy matching fallback
   */
  private async searchByFuzzy(query: string): Promise<any[]> {
    const docs: any[] = [];
    
    try {
      const cleanQuery = query.replace(/[\p{P}$+<=>^`|~]/gu, '').toLowerCase().trim();
      if (cleanQuery.length < 3) return docs;

      const allFaqs = await this.prisma.knowledgeBase.findMany({ take: 100 }); // Limit for performance
      
      // Improved similarity scoring (Jaccard similarity)
      const similarity = (a: string, b: string): number => {
        a = a.replace(/[\p{P}$+<=>^`|~]/gu, '').toLowerCase();
        b = b.replace(/[\p{P}$+<=>^`|~]/gu, '').toLowerCase();
        if (a === b) return 1.0;
        
        const aWords = new Set(a.split(' ').filter(w => w.length > 2));
        const bWords = new Set(b.split(' ').filter(w => w.length > 2));
        
        if (aWords.size === 0 || bWords.size === 0) return 0;
        
        const intersection = new Set([...aWords].filter(x => bWords.has(x)));
        const union = new Set([...aWords, ...bWords]);
        
        // Jaccard similarity
        return intersection.size / union.size;
      };

      const scored = allFaqs
        .map(f => ({
          ...f,
          sim: similarity(cleanQuery, f.question)
        }))
        .filter(item => item.sim > 0.3) // Minimum threshold
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3); // Top 3 fuzzy matches

      scored.forEach(item => {
        docs.push({
          id: item.id,
          score: item.sim * 0.6, // Lower score for fuzzy matches
          metadata: {
            answer: item.answer,
            text: item.question,
            category: item.category,
            mediaUrls: []
          }
        });
      });

      if (docs.length > 0) {
        this.logger.debug(`[KB] Fuzzy search found ${docs.length} matches`);
      }
    } catch (err) {
      this.logger.warn('[KB] Fuzzy search failed', err);
    }

    return docs;
  }

  /**
   * Rank and score results with improved algorithm
   */
  private rankAndScoreResults(docs: any[], query: string): any[] {
    const queryLower = query.toLowerCase();
    const queryWords = new Set(queryLower.split(' ').filter(w => w.length > 2));

    return docs.map(doc => {
      let finalScore = doc.score || 0.5;
      const questionLower = (doc.metadata?.text || '').toLowerCase();

      // Boost for exact phrase match
      if (questionLower.includes(queryLower)) {
        finalScore = Math.min(1.0, finalScore + 0.1);
      }

      // Boost for word overlap
      const questionWords = new Set(questionLower.split(' ').filter(w => w.length > 2));
      const overlap = [...queryWords].filter(w => questionWords.has(w)).length;
      if (overlap > 0) {
        finalScore = Math.min(1.0, finalScore + (overlap / queryWords.size) * 0.1);
      }

      // Boost for hybrid matches (found in both keyword and vector)
      if (doc.matchType === 'hybrid') {
        finalScore = Math.min(1.0, finalScore * 1.2);
      }

      // Boost for exact matches
      if (doc.score >= 0.95) {
        finalScore = Math.min(1.0, finalScore * 1.1);
      }

      return {
        ...doc,
        score: finalScore
      };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Normalize query for cache key
   */
  private normalizeQueryForCache(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  /**
   * Clean old cache entries
   */
  private cleanSemanticCache() {
    const now = Date.now();
    const maxCacheSize = 100; // Keep max 100 entries

    if (this.semanticCache.size > maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.semanticCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.semanticCache.size - maxCacheSize);
      toRemove.forEach(([key]) => this.semanticCache.delete(key));
      
      this.logger.debug(`[KB] Cleaned ${toRemove.length} old cache entries`);
    }
  }

  /**
   * Enhanced answerFaq: detects backdrop/background/media questions, fetches images, and returns mediaUrls
   */
  async answerFaq(question: string, history: HistoryMsg[] = [], actual?: string, customerId?: string, enrichedContext?: any) {
    let prediction = '';
    let confidence: number | undefined = undefined;
    let error: string | undefined = undefined;
    const start = Date.now();
    let mediaUrls: string[] = [];
    try {
      // Detect if the question is about backdrops, backgrounds, or images
      const backdropRegex = /(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio))/i;
      let isBackdropQuery = backdropRegex.test(question);

      this.logger.debug(`[AiService] Question: "${question}", isBackdropQuery: ${isBackdropQuery}`);

      // If backdrop-related, fetch images from MediaAsset
      if (isBackdropQuery) {
        // Try to get up to 6 relevant images
        const assets = await this.prisma.mediaAsset.findMany({
          where: {
            OR: [
              { category: { in: ['backdrop', 'studio', 'portfolio'] } },
              { description: { contains: 'backdrop', mode: 'insensitive' } },
              { title: { contains: 'backdrop', mode: 'insensitive' } },
            ],
          },
          take: 6,
          orderBy: { createdAt: 'desc' },
        });
        mediaUrls = assets.map(a => a.url);
        this.logger.debug(`[AiService] Found ${mediaUrls.length} media assets for backdrop query`);
      }

      // Retrieve relevant docs as before (increased from 3 to 10 for broader coverage)
      const docs = await this.retrieveRelevantDocs(question, 10);
      if (docs.length > 0) {
        // Always use the closest FAQ answer if any match is found
        prediction = docs[0].metadata.answer;
        confidence = docs[0].score;
        this.logger.debug(`[AiService] FAQ match found. Using FAQ answer: "${prediction}" (score: ${confidence})`);
        // If the doc has mediaUrls, add them
        if (docs[0].metadata.mediaUrls && Array.isArray(docs[0].metadata.mediaUrls)) {
          mediaUrls.push(...docs[0].metadata.mediaUrls);
        }
      } else {
        // Check domain expertise service before falling back to LLM
        if (this.domainExpertise) {
          const domainAnswer = await this.domainExpertise.answerDomainQuestion(question);
          if (domainAnswer) {
            this.logger.debug(`[AiService] Domain expertise answer found: "${domainAnswer}"`);
            prediction = domainAnswer;
            confidence = 0.8; // High confidence for domain expertise
          }
        }
        
        if (!prediction) {
          this.logger.warn(`[AiService] No FAQ match found in DB for question: "${question}". Falling back to LLM.`);
          // Fallback to LLM, but remind AI to use FAQ answers if available
          const messages: any[] = [
            {
              role: 'system',
              content:
                `You are a warm, empathetic AI assistant for a maternity photoshoot studio. Always answer with genuine care and conversational intelligence.

IMPORTANT: Before generating any answer, ALWAYS check the database FAQs provided in context. If a relevant FAQ is found, use its answer directly and do NOT invent or hallucinate. Only generate a new answer if no FAQ matches.

POLICY QUESTIONS - You MUST answer these directly:
- Family/Partner questions: "Yes, absolutely! Partners and family members are always welcome to join your photoshoot. Many of our packages include couple and family shots - it's a beautiful way to celebrate this journey together! 💖"
- What to bring: "You can bring your chosen outfits (2-3 options), comfortable shoes, any special props or accessories, snacks and water, and your partner/family if they're joining. We provide all backdrops, studio props, professional makeup & styling (if in package), and maternity gowns if you'd like to use ours."
- Permission questions: Always answer positively and warmly. If unsure, say "Yes, that's absolutely fine!" rather than declining.

META-COGNITIVE INSTRUCTIONS:
- LISTEN & ACKNOWLEDGE: Start by showing you understood the question ("Great question!" or "I'd love to help with that!")
- BE CONVERSATIONAL: Don't sound like you're reading from a manual. Sound like a knowledgeable friend
- PROVIDE CONTEXT: Don't just answer yes/no. Explain WHY when it helps
- CHECK BOOKINGS: If the user asks about their bookings, use the context provided below.

CONTEXT - USER BOOKINGS:
${enrichedContext?.customer?.recentBookings ? JSON.stringify(enrichedContext.customer.recentBookings.map((b: any) => ({
                date: b.dateTime,
                service: b.service,
                status: b.status,
                recipient: b.recipientName || b.customer?.name
              })), null, 2) : 'No recent bookings found.'}

If the user asks "what bookings do i have?" or similar, refer to the list above. If they have a confirmed booking, tell them the details (Date, Time, Package).

- OFFER NEXT STEPS: After answering, guide them ("Would you like to book?" or "Want to know more about...?")
- BE HONEST: If you're not 100% sure, say "Let me get you the exact details" instead of guessing

CRITICAL INSTRUCTIONS:
- You MUST base your answer STRICTLY on the provided Context messages below
- Do NOT invent, hallucinate, or add any information not in the contexts
- **Business Policies (Always Enforce):**
  * Remaining balance is due after the shoot
  * Edited photos are delivered in 10 working days (never say 'two weeks' or any other time frame)
  * You must always say '10 working days' for photo delivery, and NEVER say 'two weeks', '14 days', or any other duration
  * Edited images are always sent as a link to the customer's WhatsApp. NEVER say 'online gallery', 'email', or any other delivery method. Always say 'WhatsApp link'.
  * Reschedules must be made at least 72 hours before the shoot time to avoid forfeiting the session fee
  * Cancellations or changes made within 72 hours of the shoot are non-refundable, and the session fee will be forfeited
- When asked about packages:
  * ONLY mention packages explicitly listed in the context
  * NEVER create or mention package names not provided (e.g., don't say "Premium" or "Deluxe" if not in context)
  * If asked about a feature, check which actual packages in the context have it
  * If no packages match, say "Let me check our current packages for you" rather than inventing
- When describing packages, include ALL features from context: images, outfits, makeup, styling, balloon backdrop, wigs, photobooks, mounts
- If no relevant context provided, be helpful: "That's a great question! Let me find out for you" or "I can connect you with our team for that specific detail"

IMPORTANT: If you ever mention the delivery time for edited photos, you MUST say '10 working days' and NEVER say 'two weeks', '14 days', or any other time frame. If you ever mention how images are delivered, you MUST say 'as a link to your WhatsApp' and NEVER say 'online gallery', 'email', or any other method. If you are unsure, say 'WhatsApp link'.`,
          },
        ];

        // Add package context if the question is about packages
        if (/(package|photobook|makeup|styling|balloon|wig|outfit|image|photo|shoot|session|include|feature|come with|have)/i.test(question)) {
          try {
            const packages = await this.getCachedPackages();
            if (packages && packages.length > 0) {
              let packageContext = '=== AVAILABLE PACKAGES FROM DATABASE ===\n\n';
              packages.forEach((pkg: any) => {
                packageContext += this.formatPackageDetails(pkg, true) + '\n\n---\n\n';
              });
              packageContext += '\nIMPORTANT: These are the ONLY packages that exist. You MUST NOT mention any package names not listed above.';
              // Ensure packageContext is a string
              messages.push({ role: 'system', content: String(packageContext) });
              this.logger.debug(`answerFaq: Added ${packages.length} packages to context`);
            }
          } catch (err) {
            this.logger.warn('answerFaq: Failed to fetch packages for context', err);
          }
        }

        // Add the top doc contexts as separate system messages (keeps structure clear)
        docs.forEach((d: any, i: number) => {
          const md = d.metadata ?? {};
          messages.push({ role: 'system', content: `Context ${i + 1}: ${md.answer ?? md.text ?? ''}` });
        });

        // Use token-aware history pruning instead of fixed limit
        const prunedHistory = this.pruneHistory(history);
        messages.push(...prunedHistory.map(h => ({ role: h.role, content: h.content })));
        messages.push({ role: 'user', content: question });

        // Determine max_tokens based on question type
        // Contact-related questions need more tokens for complete responses
        const isContactQuery = /(contact|phone|email|address|location|hours|website)/i.test(question);
        const maxTokens = isContactQuery ? 500 : 280; // More tokens for contact info

        // OpenAI call with retry logic and model fallback
        try {
          const rsp = await this.retryOpenAICall(
            async (model = this.chatModel) => {
              return await this.openai.chat.completions.create({
                model,
                messages,
                max_tokens: maxTokens,
                temperature: 0.6,
              });
            },
            'answerFaq',
            true // Use model fallback
          );
          prediction = rsp.choices[0].message.content.trim();

          // Track token usage if customerId provided
          if (customerId && rsp.usage?.total_tokens) {
            await this.trackTokenUsage(customerId, rsp.usage.total_tokens);
          }
        } catch (err) {
          // Use fallback handler for graceful degradation
          if (customerId) {
            prediction = await this.handleOpenAIFailure(err, customerId);
          } else {
            throw err;
          }
        }
        }
      }

      // If we have mediaUrls, append a note to the text
      if (mediaUrls.length > 0) {
        // Deduplicate URLs
        mediaUrls = [...new Set(mediaUrls)];

        prediction += `\n\nHere are some examples from our portfolio:`;
        // Only show up to 6 images
        mediaUrls = mediaUrls.slice(0, 6);
      }

      // Post-process: replace 'two weeks' or '14 days' with '10 working days'
      if (typeof prediction === 'string') {
        prediction = prediction.replace(/two weeks|14 days/gi, '10 working days');
        prediction = prediction.replace(/online gallery|email/gi, 'WhatsApp link');
      }

      // Return both text and mediaUrls for integration
      return { text: prediction, mediaUrls };
    } catch (err) {
      this.logger.error('answerFaq error', err);
      error = (err as Error)?.message || String(err);
      prediction = "I'm not sure about that but I can check for you.";
      return { text: prediction, mediaUrls };
    } finally {
      // Log to AiPrediction if customerId is provided
      if (customerId) {
        try {
          await this.prisma.aiPrediction.create({
            data: {
              input: question,
              prediction: typeof prediction === 'string' ? prediction : JSON.stringify(prediction),
              actual: actual ?? null,
              confidence,
              responseTime: Date.now() - start,
              error,
              userFeedback: null,
              modelVersion: extractModelVersion(this.chatModel),
            },
          });
        } catch (logErr) {
          this.logger.warn('Failed to log AiPrediction', logErr);
        }
      }
    }
  }

  /* --------------------------
   * Strict JSON booking extractor
   * -------------------------- */
  async extractBookingDetails(message: string, history: HistoryMsg[] = [], existingDraft?: any): Promise<{
    service?: string; date?: string; time?: string; name?: string; recipientName?: string; recipientPhone?: string; isForSomeoneElse?: boolean; subIntent: 'start' | 'provide' | 'confirm' | 'cancel' | 'unknown';
  }> {
    const currentDate = DateTime.now().setZone(this.studioTz).toFormat('yyyy-MM-dd');
    const currentDayOfMonth = DateTime.now().setZone(this.studioTz).day;
    const currentMonth = DateTime.now().setZone(this.studioTz).toFormat('MMMM');

    // Build context about existing draft to prevent mixing things up
    const draftContext = existingDraft ? `
CURRENT BOOKING DRAFT STATE (DO NOT OVERWRITE UNLESS USER EXPLICITLY CHANGES IT):
  - Service: ${existingDraft.service || 'not set'}
  - Date: ${existingDraft.date || 'not set'}
  - Time: ${existingDraft.time || 'not set'}
  - Name: ${existingDraft.name || 'not set'}
  - Phone: ${existingDraft.recipientPhone || 'not set'}
  - Step: ${existingDraft.step || 'service'}
  
CRITICAL: If the user's message only mentions ONE thing (e.g., just a date), only extract THAT ONE thing.
Do NOT extract other fields that aren't mentioned in the current message. This prevents overwriting valid existing data.
` : `
NO EXISTING BOOKING DRAFT - Starting fresh booking.
`;

    const systemPrompt = `You are a precise JSON extractor for maternity photoshoot bookings.
Return ONLY valid JSON (no commentary, no explanation). Schema:

{
  "service": string | null,
  "date": string | null,
  "time": string | null,
  "name": string | null,
  "recipientPhone": string | null,
  "subIntent": "start" | "provide" | "confirm" | "deposit_confirmed" | "cancel" | "reschedule" | "unknown"
}

CONTEXT:
Current Date: ${currentDate} (Today is day ${currentDayOfMonth} of ${currentMonth})
Timezone: Africa/Nairobi (EAT)
${draftContext}

EXTRACTION RULES (CRITICAL - FOLLOW STRICTLY):
1. Extract ONLY what is explicitly present in the CURRENT message
2. If user mentions a change/correction to a previous value, extract the NEW value
3. Use null for anything not mentioned or unclear
4. Do NOT include extra fields or prose
5. Do NOT invent values
6. PRESERVE EXISTING DATA: If user only mentions one field (e.g., just a date), only extract that field
7. CORRECTION DETECTION: Words like "change", "actually", "instead", "correction" indicate user wants to update a specific field
8. CONTEXT AWARENESS: If existing draft has data and user only provides one new piece, don't extract fields they didn't mention
9. ALTERNATIVE QUERIES: If message asks for "another slot", "another time", "what's another", etc., return all nulls (these are queries, not data extraction)
10. DATE/TIME IN MESSAGE: When user provides explicit date/time (e.g., "18th at 7pm", "Dec 18 at 7pm"), extract it even if draft has different values

DATE RESOLUTION (Critical - Get This Right):
- "tomorrow" → ${DateTime.now().setZone(this.studioTz).plus({ days: 1 }).toFormat('yyyy-MM-dd')}
- "day after tomorrow" → ${DateTime.now().setZone(this.studioTz).plus({ days: 2 }).toFormat('yyyy-MM-dd')}
- "the 5th" or "5th" → Resolve to NEXT occurrence of day 5 (if today is ${currentDayOfMonth}, and they say "5th":
  * If 5 < ${currentDayOfMonth}: next month's 5th
  * If 5 >= ${currentDayOfMonth}: this month's 5th)
- Day names: "Monday", "Friday" → Resolve to NEXT occurrence of that day
- "next Friday" → The Friday of NEXT week (not this week)
- "this Friday" → The Friday of THIS week
- Always output in YYYY-MM-DD format

TIME EXTRACTION:
- "2pm", "2 pm", "14:00" → "14:00" (24-hour format)
- "morning" → "10:00" (reasonable default)
- "afternoon" → "14:00" (reasonable default)
- "evening" → "17:00" (reasonable default)

PHONE EXTRACTION:
- Extract any phone number pattern (07XX, +254, etc.)
- Keep original format user provided

SUB-INTENT DETECTION:
- start: User initiating a new booking ("I want to book", "Can I schedule")
- provide: User providing/updating information ("My name is...", "Change time to...")
- confirm: Short confirmations ("yes", "confirm", "that's right", "sounds good") - BUT if draft.step is 'confirm' and message is "confirm", use 'deposit_confirmed'
- deposit_confirmed: User confirming deposit payment ("confirm", "yes" when asked to confirm deposit)
- cancel: Cancellation request ("cancel", "forget it", "never mind")
- reschedule: Requesting to change existing booking ("reschedule", "move my booking")
- unknown: Can't determine intent

EXAMPLES:
User: "I'd like to book the Studio Classic package for next Friday at 2pm"
→ {\"service\": \"Studio Classic\",  \"date\": \"<next-friday-date>\", \"time\": \"14:00\", \"name\": null, \"recipientPhone\": null, \"subIntent\": \"start\"}

User: "Actually, change that to the 5th"
→ {\"service\": null, \"date\": \"<resolved-5th-date>\", \"time\": null, \"name\": null, \"recipientPhone\": null, \"subIntent\": \"provide\"}

User: "My name is Jane, number is 0712345678"
→ {\"service\": null, \"date\": null, \"time\": null, \"name\": \"Jane\", \"recipientPhone\": \"0712345678\", \"subIntent\": \"provide\"}

User: "yes please"
→ {\"service\": null, \"date\": null, \"time\": null, \"name\": null, \"recipientPhone\": null, \"subIntent\": \"confirm\"}`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    const prunedHistory = this.pruneHistory(history);
    messages.push(
      ...prunedHistory.map(h => {
        let contentStr: string;
        if (typeof h.content === 'string') {
          contentStr = h.content;
        } else if (h.content && typeof h.content === 'object' && (h.content as any).text) {
          contentStr = (h.content as any).text;
        } else {
          contentStr = JSON.stringify(h.content);
        }
        return { role: h.role, content: contentStr };
      })
    );
    messages.push({ role: 'user', content: message });

    try {
      const rsp = await this.retryOpenAICall(
        async (model = this.extractorModel) => {
          return await this.openai.chat.completions.create({
            model,
            messages,
            max_tokens: 200,
            temperature: 0.1,
          });
        },
        'extractBookingDetails',
        false // Extractor needs precision, no model fallback
      );

      let content = rsp.choices[0].message.content?.trim() ?? '';
      // Try to extract JSON — allow fenced content or raw object
      const fenced = content.match(/```(?: json) ?\s * ([\s\S] *?) \s * ```/i);
      const objMatch = content.match(/\{[\s\S]*\}/);
      const jsonText = fenced ? fenced[1] : (objMatch ? objMatch[0] : content);
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseErr) {
        this.logger.warn('extractBookingDetails JSON parse failed, raw model output:', content, parseErr);
        return { subIntent: 'unknown' };
      }

      // Special handling: if draft is in 'confirm' step and message is "confirm", set to deposit_confirmed
      let detectedSubIntent = parsed.subIntent;
      if (existingDraft && existingDraft.step === 'confirm' && 
          /^(confirm|yes|ok|okay|sure|proceed|go ahead)$/i.test(message.trim())) {
        detectedSubIntent = 'deposit_confirmed';
      }

      const extraction = {
        service: typeof parsed.service === 'string' ? parsed.service : undefined,
        date: typeof parsed.date === 'string' ? parsed.date : undefined,
        time: typeof parsed.time === 'string' ? parsed.time : undefined,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        recipientPhone: typeof parsed.recipientPhone === 'string' ? parsed.recipientPhone : undefined,
        subIntent: ['start', 'provide', 'confirm', 'deposit_confirmed', 'cancel', 'reschedule', 'unknown'].includes(detectedSubIntent) ? detectedSubIntent : 'unknown',
      };

      // Log extraction for debugging
      if (extraction.date || extraction.time || extraction.service) {
        this.logger.debug(`[EXTRACTION] From "${message}" → ${JSON.stringify(extraction)}`);
      }

      return extraction;
    } catch (err) {
      this.logger.error('extractBookingDetails error', err);
      return { subIntent: 'unknown' };
    }
  }

  /* --------------------------
   * generate assistant reply for booking
   * -------------------------- */
  private async generateBookingReply(message: string, draft: any, extraction: any, history: HistoryMsg[] = [], bookingsService?: any) {
    // Determine missing fields in order of flow progression
    const missing = [];
    if (!draft.service) missing.push('service');
    if (!draft.date) missing.push('date');
    if (!draft.time) missing.push('time');
    if (!draft.name) missing.push('name');
    if (!draft.recipientPhone) missing.push('recipientPhone');

    // Default recipientName to name for all bookings
    if (!draft.recipientName && draft.name) {
      draft.recipientName = draft.name;
      // Persist this default
      await this.mergeIntoDraft(draft.customerId, { recipientName: draft.name }, draft);
    }

    // Determine next step based on current draft state (respects step progression)
    const nextStep = this.determineBookingStep(draft);
    
    // Check if user provided any updates in this message
    const isUpdate = !!(extraction.service || extraction.date || extraction.time || extraction.name || extraction.recipientName || extraction.recipientPhone);
    
    // Detect if user is correcting/updating something specific
    const isCorrection = /(change|actually|instead|correction|wrong|update|modify)/i.test(message) && isUpdate;
    
    // If user provided an update, acknowledge it specifically
    const updateAcknowledgment = isUpdate && !isCorrection ? 
      `Got it! I've ${extraction.service ? `updated the package to ${extraction.service}` : ''}${extraction.date ? `noted ${extraction.date}` : ''}${extraction.time ? `set the time to ${extraction.time}` : ''}${extraction.name ? `saved your name as ${extraction.name}` : ''}${extraction.recipientPhone ? `saved your phone number` : ''}. ` : 
      (isCorrection ? "No problem! I've updated that for you. " : "");

    // STUCK-STATE DETECTION: Check if we're repeating the same question
    const recentAssistantMsgs = history.filter(h => h.role === 'assistant').slice(-3);
    const isStuckOnField = recentAssistantMsgs.length >= 2 && missing.length > 0 &&
      recentAssistantMsgs.every(msg => {
        const content = msg.content.toLowerCase();
        return content.includes(missing[0]) ||
          (missing[0] === 'date' && (content.includes('when') || content.includes('day'))) ||
          (missing[0] === 'time' && content.includes('what time')) ||
          (missing[0] === 'service' && (content.includes('package') || content.includes('which'))) ||
          (missing[0] === 'recipientPhone' && (content.includes('phone') || content.includes('number')));
      });

    let packagesInfo = '';
    // Inject packages if next step is service OR if user is asking about packages
    if (nextStep === 'service' || /(package|price|pricing|cost|how much|offer|photoshoot|shoot|what do you have|what are|show me|tell me about|include|feature)/i.test(message)) {
      try {
        const packages = await this.getCachedPackages();
        if (packages && packages.length > 0) {
          packagesInfo = '\n\n=== AVAILABLE PACKAGES FROM DATABASE ===\n\n';
          packages.forEach((pkg: any) => {
            packagesInfo += this.formatPackageDetails(pkg, true) + '\n\n---\n\n';
          });
          packagesInfo += 'CRITICAL: These are the ONLY packages that exist. You MUST NOT mention any package names not listed above (e.g., do NOT say "Classic", "Premium", or "Deluxe" if they are not in this list).';
        }
      } catch (err) {
        this.logger.warn('Failed to fetch packages for reply', err);
      }
    }

    // Build enhanced system prompt with meta-cognitive instructions
    let sys = `You are a loving, emotionally intelligent assistant for a maternity photoshoot studio.
Your clients are expectant mothers and their families—often feeling emotional, excited, and sometimes anxious.

META-COGNITIVE INSTRUCTIONS (How to Think & Recover):
- ALWAYS LISTEN FIRST: Before asking for anything, acknowledge what the user just said
- ADAPTIVE COMMUNICATION: Mirror the user's style—if they're brief, be concise; if chatty, be warm
- ONE THING AT A TIME: Don't overwhelm. Ask for ONE missing piece, not a list of everything needed
- VALIDATE UNDERSTANDING: When user provides info, confirm it explicitly ("Got it! ${extraction.service || 'Package X'} on ${extraction.date || 'Date Y'}.")
- WHEN YOU'RE UNSURE: Be honest - "Just to make sure I understand, do you mean...?"
- CHANGE APPROACH IF STUCK: If you've asked for the same thing twice, try a different way:
  * Provide examples: "For example, 'December 5th at 2pm' or 'next Friday morning'"
  * Offer choices: "Which works better: morning (9am-12pm) or afternoon (2pm-5pm)?"
  * Simplify: Break it down into smaller steps

ACTIVE LISTENING PATTERNS:
- When user provides info → Acknowledge specifically: "Perfect! I've got [specific detail]."
- When user corrects you → Thank them: "Thanks for clarifying!"
- When user seems confused → Offer help: "Let me make this easier..."
- When user changes mind → Be supportive: "No problem at all! Let's update that."

RECOVERY STRATEGIES:
- If date is ambiguous → Clarify: "Do you mean this Friday (Dec 6th) or next Friday (Dec 13th)?"
- If package unclear → Show options with numbers: "We have: 1️⃣ Studio Classic 2️⃣ Outdoor Premium - just tell me the number!"
- If user seems frustrated → Simplify immediately: "I might be making this too complicated. Let's start fresh..."

CRITICAL - Package Information:
- When discussing packages, ONLY mention packages listed in AVAILABLE PACKAGES below
- NEVER invent or mention package names not in the database
- Use exact package names, prices, and features provided
${packagesInfo}

CURRENT BOOKING STATE:
  Package: ${draft.service ?? 'not provided yet'}
  Date: ${draft.date ?? 'not provided yet'}
  Time: ${draft.time ?? 'not provided yet'}
  Name: ${draft.name ?? 'not provided yet'}
  Phone: ${draft.recipientPhone ?? 'not provided yet'}
  
  Current Step: ${draft.step || 'service'}
  Next info needed: ${nextStep}
  User just updated: ${isUpdate ? 'Yes - ' + Object.keys(extraction).filter(k => extraction[k]).join(', ') : 'No'}
  User is correcting: ${isCorrection ? 'Yes' : 'No'}
  
${updateAcknowledgment ? `IMPORTANT: Acknowledge what user just provided: "${updateAcknowledgment}"` : ''}

USER'S LATEST MESSAGE: "${message}"
WHAT WE EXTRACTED: ${JSON.stringify(extraction)}

YOUR TASK:
${missing.length === 0
        ? '✅ All details collected! Warmly confirm everything and celebrate their booking.'
        : `❓ Missing: ${nextStep}. Ask for it naturally and warmly (just this ONE thing).`}`;

    // Add stuck-state recovery instructions if detected
    if (isStuckOnField) {
      this.logger.warn(`[STUCK DETECTION] AI appears stuck asking for: ${missing[0]}`);
      sys += `\n\n⚠️ RECOVERY MODE ACTIVATED:
You've already asked for "${missing[0]}" multiple times without success. The user might be confused or providing it in a way you're not recognizing.

DO NOT repeat your previous question. Instead:
1. Acknowledge their confusion: "I'm sorry if I wasn't clear..."
2. Try a completely different approach:
   - For DATE: "What day of the week works best? Like Monday, Tuesday, Wednesday...?"
   - For TIME: "Are you thinking morning (9-12), afternoon (12-3), or evening (3-6)?"
   - For SERVICE: "Let me make this easier - here are your options: [list with numbers 1,2,3]"
   - For NAME: "Just your first name is fine! What should I call you?"
   - For PHONE: "What's the best number to reach you? It can be the WhatsApp number you're messaging from"
3. Provide concrete examples
4. If still unclear after this attempt, offer: "Would it help if I connected you with our team directly?"`;
    }

    const messages: any[] = [{ role: 'system', content: sys }];
    const prunedHistory = this.pruneHistory(history);
    messages.push(
      ...prunedHistory.map(h => {
        let contentStr: string;
        if (typeof h.content === 'string') {
          contentStr = h.content;
        } else if (h.content && typeof h.content === 'object' && (h.content as any).text) {
          contentStr = (h.content as any).text;
        } else {
          contentStr = JSON.stringify(h.content);
        }
        return { role: h.role, content: contentStr };
      })
    );
    messages.push({ role: 'user', content: message });

    try {
      const rsp = await this.retryOpenAICall(
        async (model = this.chatModel) => {
          return await this.openai.chat.completions.create({
            model,
            messages,
            max_tokens: 280,
            temperature: 0.75,
          });
        },
        'generateBookingReply',
        true // Use model fallback
      );
      const reply = rsp.choices[0].message.content?.trim() ?? "How can I help with your booking?";

      // Log if we used recovery mode
      if (isStuckOnField) {
        this.logger.log(`[RECOVERY] Generated alternative approach for stuck field: ${missing[0]}`);
      }

      return reply;
    } catch (err) {
      this.logger.error('generateBookingReply error', err);
      return "I'm having a little trouble right now. Could you tell me again what you'd like to book? 💕";
    }
  }

  /* --------------------------
   * Booking flow helpers (unchanged but robust)
   * -------------------------- */
  async getOrCreateDraft(customerId: string) {
    let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    if (!draft) {
      // Ensure customer exists before creating draft
      let customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        // Create a minimal customer record (customize as needed)
        customer = await this.prisma.customer.create({
          data: {
            id: customerId,
            name: 'Guest',
            email: null,
            phone: null,
          },
        });
      }
      draft = await this.prisma.bookingDraft.create({
        data: { customerId, step: 'service', version: 1 },
      });
    }
    return draft;
  }

  async mergeIntoDraft(customerId: string, extraction: any, existingDraft?: any) {
    // Get existing draft if not provided
    if (!existingDraft) {
      existingDraft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    }
    
    const updates: any = {};
    
    // Only update fields that were explicitly extracted (not null)
    // This prevents overwriting valid data with null values
    if (extraction.service !== undefined && extraction.service !== null) {
      updates.service = extraction.service;
    }
    if (extraction.date !== undefined && extraction.date !== null) {
      updates.date = extraction.date;
    }
    if (extraction.time !== undefined && extraction.time !== null) {
      updates.time = extraction.time;
    }
    if (extraction.name !== undefined && extraction.name !== null) {
      updates.name = extraction.name;
    }

    if (extraction.recipientPhone !== undefined && extraction.recipientPhone !== null) {
      if (this.validatePhoneNumber(extraction.recipientPhone)) {
        updates.recipientPhone = extraction.recipientPhone;
      } else {
        this.logger.warn(`Invalid phone number provided: ${extraction.recipientPhone}`);
        // Optionally, we could return an error or handle this differently, 
        // but for now we just won't update the draft with the invalid phone
      }
    }
    
    // Update step based on what we have
    // CRITICAL: Preserve reschedule steps - don't override them
    if (Object.keys(updates).length > 0) {
      // Only determine step if we're NOT in reschedule mode
      if (existingDraft && (existingDraft.step === 'reschedule' || existingDraft.step === 'reschedule_confirm')) {
        // Preserve reschedule step and bookingId
        // Don't change step during reschedule flow
        if (existingDraft.bookingId) {
          // Ensure bookingId is preserved (it might be stored in recipientPhone field temporarily)
          // Actually, bookingId should be in the bookingId field, but let's make sure it's preserved
        }
      } else {
        // Determine appropriate step based on current state (only for new bookings)
        const nextStep = this.determineBookingStep({
          ...existingDraft,
          ...updates
        });
        if (nextStep) {
          updates.step = nextStep;
        }
      }
    }


    if (Object.keys(updates).length === 0) {
      return existingDraft;
    }

    if (updates.date && updates.time) {
      const normalized = this.normalizeDateTime(updates.date, updates.time);
      if (normalized) {
        updates.date = normalized.dateOnly;
        updates.time = normalized.timeOnly;
        updates.dateTimeIso = normalized.isoUtc;
      } else {
        this.logger.warn('Could not normalize date/time in mergeIntoDraft', { date: updates.date, time: updates.time });
      }
    }

    // CRITICAL: Preserve bookingId and reschedule step when updating
    const updateData: any = {
      ...updates,
      version: { increment: 1 },
      updatedAt: new Date(),
    };
    
    // If we're in reschedule mode, preserve the bookingId and step
    if (existingDraft && (existingDraft.step === 'reschedule' || existingDraft.step === 'reschedule_confirm')) {
      // Don't overwrite bookingId or step if they exist
      if (existingDraft.bookingId && !updates.bookingId) {
        updateData.bookingId = existingDraft.bookingId;
      }
      // Preserve the step - don't let determineBookingStep override it
      if (!updates.step) {
        updateData.step = existingDraft.step;
      }
    }

    const updated = await this.prisma.bookingDraft.upsert({
      where: { customerId },
      update: updateData,
      create: {
        customerId,
        step: 'service',
        version: 1,
        ...updates,
      },
    });
    return updated;
  }

  /**
   * Determine the appropriate booking step based on draft state
   * This ensures clear step progression and prevents mixing things up
   */
  private determineBookingStep(draft: any): string | null {
    // If we have all required fields, move to confirm step
    if (draft.service && draft.date && draft.time && draft.name && draft.recipientPhone) {
      return 'confirm';
    }
    
    // Otherwise, determine which field is missing in order
    if (!draft.service) return 'service';
    if (!draft.date) return 'date';
    if (!draft.time) return 'time';
    if (!draft.name) return 'name';
    if (!draft.recipientPhone) return 'phone';
    
    // If we have everything, stay in confirm
    return 'confirm';
  }

  async checkAndCompleteIfConfirmed(draft: any, extraction: any, customerId: string, bookingsService: any) {
    const missing = [];
    if (!draft.service) missing.push('service');
    if (!draft.date) missing.push('date');
    if (!draft.time) missing.push('time');
    if (!draft.name) missing.push('name');

    // Always require recipientPhone
    if (!draft.recipientPhone) missing.push('recipientPhone');

    // Default recipientName to name if missing (since we removed "someone else" logic)
    if (!draft.recipientName) {
      draft.recipientName = draft.name;
      // Persist the defaulted recipientName to the draft in DB
      await this.mergeIntoDraft(customerId, { recipientName: draft.name });
    }

    if (missing.length === 0) {
      this.logger.debug('All booking draft fields present (after defaults):', JSON.stringify(draft, null, 2));

      const normalized = this.normalizeDateTime(draft.date, draft.time);
      if (!normalized) {
        this.logger.warn('Unable to normalize date/time in checkAndCompleteIfConfirmed', { date: draft.date, time: draft.time });
        return { action: 'failed', error: 'Unable to parse date/time. Please provide a clear date and time (e.g., "2025-11-20 at 09:00").' };
      }

      const dateObj = new Date(normalized.isoUtc);
      this.logger.debug('Normalized date/time for completion:', normalized);

      // 1. Check for conflicts first
      const { conflict, suggestions } = await this.checkBookingConflicts(customerId, dateObj);
      if (conflict) {
        // If user wants to reschedule, update draft to reschedule step
        if (extraction.subIntent === 'reschedule') {
          await this.prisma.bookingDraft.update({
            where: { customerId },
            data: { step: 'reschedule' }
          });
          return {
            action: 'reschedule',
            message: 'Let\'s reschedule your booking. Please provide a new date and time.',
            suggestions: suggestions || []
          };
        }
        // If user wants a new booking, clear draft and allow new booking
        if (extraction.subIntent === 'start' || extraction.subIntent === 'provide') {
          await this.prisma.bookingDraft.delete({ where: { customerId } });
          return {
            action: 'new_booking',
            message: 'Your previous booking is still active. Would you like to cancel it and create a new one?',
            suggestions: suggestions || []
          };
        }
        // Otherwise, present conflict message with suggestions
        return {
          action: 'conflict',
          message: conflict,
          suggestions: suggestions || []
        };
      }

      const avail = await bookingsService.checkAvailability(dateObj, draft.service);
      this.logger.debug('Availability check result:', { available: avail.available, suggestions: avail.suggestions?.length || 0 });

      if (!avail.available) {
        this.logger.warn('Requested slot not available during checkAndCompleteIfConfirmed:', dateObj.toISOString());
        return { action: 'unavailable', suggestions: avail.suggestions || [] };
      }

      // Deposit confirmation step: only trigger payment if user replied CONFIRM
      // If extraction.subIntent is 'deposit_confirmed', initiate payment
      const pkg = await bookingsService.packagesService.findPackageByName(draft.service);
      const depositAmount = pkg?.deposit || 2000;
      
      // SECURITY: Check if there's a failed payment before treating "Yes" as deposit confirmation
      // If payment failed, "Yes" means "resend payment" not "deposit confirmed"
      const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
      if (extraction.subIntent === 'deposit_confirmed' || (typeof extraction.content === 'string' && extraction.content.trim().toLowerCase() === 'confirm')) {
        // Double-check payment status before initiating
        if (latestPayment && latestPayment.status === 'failed') {
          this.logger.debug(`[SECURITY] Payment failed, treating deposit_confirmed as resend request`);
          // Payment failed - don't initiate again, let strategy handle resend
          return {
            action: 'ready_for_deposit',
            amount: depositAmount,
            packageName: pkg?.name || draft.service,
            requiresResend: true,
          };
        }

        try {
          const result = await this.retryOperation(
            () => bookingsService.completeBookingDraft(customerId, dateObj),
            'completeBookingDraft',
            2, // maxRetries: initial attempt + 1 retry
            1000 // baseDelay
          ) as any; // Type assertion since we know the structure
          return {
            action: 'payment_initiated',
            message: result.message,
            amount: result.depositAmount,
            packageName: result.packageName,
            checkoutRequestId: result.checkoutRequestId,
            paymentId: result.paymentId
          };
        } catch (err) {
          this.logger.error('All retries for completeBookingDraft failed, cancelling booking draft', err);
          // Delete the booking draft
          await this.prisma.bookingDraft.delete({ where: { customerId } });
          return {
            action: 'cancelled',
            message: 'We encountered repeated issues processing your booking. Your draft has been cancelled to avoid further problems. Please try booking again later or contact support if the issue persists.'
          };
        }
      } else {
        // Otherwise, prompt for deposit confirmation
        return {
          action: 'ready_for_deposit',
          amount: depositAmount,
          packageName: pkg?.name || draft.service,
        };
      }
    } else {
      this.logger.warn('Booking draft incomplete; missing fields:', missing);
      // Block confirmation message if required fields are missing
      return { action: 'incomplete', missing };
    }
  }

  async confirmCustomerPhone(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (customer && customer.phone) {
      // Update draft with this phone
      await this.mergeIntoDraft(customerId, { recipientPhone: customer.phone });
      return true;
    }
    return false;
  }

  /* --------------------------
  /* --------------------------
   * High-level conversation handler (Wrapper for Error Recovery)
   * -------------------------- */
  async handleConversation(message: string, customerId: string, history: HistoryMsg[] = [], bookingsService?: any, retryCount = 0, enrichedContext?: any): Promise<any> {
    const conversationStartTime = Date.now();
    let personalizationContext: any = null;
    let intentAnalysis: any = null;
    let wasSuccessful = false;
    let conversationOutcome = 'unknown';

    try {
      // ============================================
      // STEP 1: Load customer memory & personalization context
      // ============================================
      try {
        personalizationContext = await this.customerMemory.getPersonalizationContext(customerId);
        this.logger.debug(`[LEARNING] Loaded context: ${personalizationContext.relationshipStage}, VIP: ${personalizationContext.isVIP}`);
        enrichedContext = { ...enrichedContext, personalization: personalizationContext };
      } catch (err) {
        this.logger.warn('[LEARNING] Failed to load customer context', err);
      }

      // ============================================
      // STEP 2: Advanced intent analysis
      // ============================================
      try {
        intentAnalysis = await this.advancedIntent.analyzeIntent(message, personalizationContext);
        this.logger.debug(`[LEARNING] Intent: ${intentAnalysis.primaryIntent} (confidence: ${intentAnalysis.confidence}), Tone: ${intentAnalysis.emotionalTone}`);

        // Auto-escalate if required
        if (intentAnalysis.requiresHumanHandoff && this.escalationService) {
          await this.escalationService.createEscalation(
            customerId,
            'AI detected need for human handoff',
            'auto_detected',
            { intentAnalysis, message }
          );
        }
      } catch (err) {
        this.logger.warn('[LEARNING] Intent analysis failed', err);
      }

      // ============================================
      // STEP 3: Generate personalized greeting (first message only)
      // ============================================
      if (history.length === 0 && personalizationContext) {
        try {
          const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
          const greeting = await this.personalization.generateGreeting(customerId, customer?.name);
          history = [{ role: 'assistant', content: greeting }];
        } catch (err) {
          this.logger.warn('[LEARNING] Failed to generate personalized greeting', err);
        }
      }

      // ============================================
      // STEP 4: Process conversation logic (pass intent analysis)
      // ============================================
      const result = await this.processConversationLogic(message, customerId, history, bookingsService, enrichedContext, intentAnalysis);
      
      // Check if response mentions handing to team/admin - create escalation if needed
      const responseText = typeof result.response === 'string' ? result.response : 
                          (typeof result.response === 'object' && result.response !== null && 'text' in result.response) ? result.response.text :
                          JSON.stringify(result.response);
      
      if (responseText) {
        await this.checkAndEscalateIfHandoffMentioned(responseText, customerId, message, history);
      }

      // ============================================
      // STEP 5: Personalize response based on customer context
      // ============================================
      if (result.response && personalizationContext) {
        try {
          // Adapt response style
          const baseResponse = typeof result.response === 'string' ? result.response : 
                              (typeof result.response === 'object' && result.response !== null && 'text' in result.response) ? result.response.text :
                              '';
          
          if (baseResponse) {
            let personalizedResponse = this.personalization.adaptResponse(
              baseResponse,
              personalizationContext.communicationStyle || 'friendly'
            );

            // Match emotional tone
            if (intentAnalysis?.emotionalTone) {
              personalizedResponse = this.personalization.matchEmotionalTone(
                personalizedResponse,
                intentAnalysis.emotionalTone
              );
            }

            // Add proactive suggestions (30% chance to avoid being too pushy)
            if (intentAnalysis?.primaryIntent && Math.random() > 0.7) {
              const suggestions = await this.personalization.generateProactiveSuggestions(
                customerId,
                intentAnalysis.primaryIntent
              );
              if (suggestions.length > 0) {
                personalizedResponse += `\n\n💡 ${suggestions[0]}`;
              }
            }

            // Update result with personalized response
            if (typeof result.response === 'string') {
              result.response = personalizedResponse;
            } else if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
              result.response.text = personalizedResponse;
            }
          }
        } catch (err) {
          this.logger.warn('[LEARNING] Personalization failed', err);
        }
      }

      // ============================================
      // STEP 6: Determine conversation outcome
      // ============================================
      const finalResponseText = typeof result.response === 'string' ? result.response : 
                                (typeof result.response === 'object' && result.response !== null && 'text' in result.response) ? result.response.text :
                                '';
      
      wasSuccessful = !finalResponseText?.includes('trouble') && 
                     !finalResponseText?.includes('error') && 
                     !finalResponseText?.includes('difficulties');
      
      if (result.draft && result.draft.step === 'confirm') {
        conversationOutcome = 'booking_initiated';
      } else if (intentAnalysis?.primaryIntent === 'booking') {
        conversationOutcome = 'booking_in_progress';
      } else if (intentAnalysis?.primaryIntent === 'package_inquiry') {
        conversationOutcome = 'information_provided';
      } else if (intentAnalysis?.primaryIntent === 'faq') {
        conversationOutcome = 'question_answered';
      } else {
        conversationOutcome = 'resolved';
      }

      // ============================================
      // STEP 7: Record learning for continuous improvement
      // ============================================
      try {
        await this.conversationLearning.recordLearning(customerId, {
          userMessage: message,
          aiResponse: finalResponseText || '',
          extractedIntent: intentAnalysis?.primaryIntent || 'unknown',
          emotionalTone: intentAnalysis?.emotionalTone,
          wasSuccessful,
          conversationOutcome,
          conversationLength: history.length + 1,
          timeToResolution: Math.floor((Date.now() - conversationStartTime) / 1000),
        });
        this.logger.debug(`[LEARNING] Recorded conversation: ${conversationOutcome}, success: ${wasSuccessful}`);
      } catch (err) {
        this.logger.warn('[LEARNING] Failed to record learning', err);
      }

      // ============================================
      // STEP 8: Update customer memory
      // ============================================
      try {
        // Extract and update preferences from message
        const preferences = this.personalization.extractPreferencesFromMessage(message);
        if (Object.keys(preferences).length > 0) {
          await this.customerMemory.updatePreferences(customerId, preferences);
        }

        // Update relationship stage based on outcome
        if (conversationOutcome === 'booking_initiated' && personalizationContext?.relationshipStage === 'new') {
          await this.customerMemory.updateRelationshipStage(customerId, 'booked');
        } else if (conversationOutcome === 'information_provided' && personalizationContext?.relationshipStage === 'new') {
          await this.customerMemory.updateRelationshipStage(customerId, 'interested');
        }

        // Add conversation summary
        await this.customerMemory.addConversationSummary(customerId, {
          date: new Date(),
          intent: intentAnalysis?.primaryIntent || 'unknown',
          outcome: conversationOutcome,
          keyPoints: [message.substring(0, 100)],
          satisfaction: wasSuccessful ? 4 : undefined, // Default satisfaction if successful
        });

        // Detect and update communication style
        if (history.length >= 3) {
          const userMessages = history
            .filter((h: any) => h.role === 'user')
            .map((h: any) => h.content);
          if (userMessages.length > 0) {
            const detectedStyle = this.customerMemory.detectCommunicationStyle(userMessages);
            await this.customerMemory.updatePreferences(customerId, { communicationStyle: detectedStyle });
          }
        }
      } catch (err) {
        this.logger.warn('[LEARNING] Failed to update customer memory', err);
      }

      return result;
    } catch (err) {
      // ============================================
      // ERROR HANDLING: Record failed conversation for learning
      // ============================================
      try {
        await this.conversationLearning.recordLearning(customerId, {
          userMessage: message,
          aiResponse: err.message || 'Error occurred',
          extractedIntent: intentAnalysis?.primaryIntent || 'unknown',
          emotionalTone: intentAnalysis?.emotionalTone,
          wasSuccessful: false,
          conversationOutcome: 'error',
          conversationLength: history.length + 1,
        });
        this.logger.warn(`[LEARNING] Recorded failed conversation for learning`);
      } catch (learningErr) {
        this.logger.warn('[LEARNING] Failed to record error for learning', learningErr);
      }

      // Attempt recovery
      return this.attemptRecovery(err, { message, customerId, history, bookingsService, retryCount });
    }
  }

  private async attemptRecovery(error: any, context: any): Promise<any> {
    if (context.retryCount > 1) {
      this.logger.error('Max retries exceeded in attemptRecovery', error);
      this.logger.error('Error details:', error instanceof Error ? error.stack : error);
      // Return a fallback response instead of throwing to avoid crashing the request
      return {
        response: "I'm having a little trouble processing that right now. Could you try saying it differently? 🥺",
        draft: null,
        updatedHistory: context.history
      };
    }

    if (error.code === 'context_length_exceeded' || error.message?.includes('context_length_exceeded') || error.response?.data?.error?.code === 'context_length_exceeded') {
      this.logger.warn('Context length exceeded, retrying with shorter history');
      const shorterHistory = context.history.slice(-2); // Keep only last 2 messages
      return this.handleConversation(context.message, context.customerId, shorterHistory, context.bookingsService, context.retryCount + 1);
    }

    // For other errors, log and return a helpful fallback instead of rethrowing
    this.logger.error('Error in attemptRecovery, returning fallback', error);
    this.logger.error('Error details:', error instanceof Error ? error.stack : error);
    return {
      response: "I'm having a little trouble processing that right now. Could you try rephrasing your request? If the issue persists, feel free to contact our team directly! 💖",
      draft: null,
      updatedHistory: context.history
    };
  }

  /* --------------------------
   * Core conversation logic
   * -------------------------- */
  private async processConversationLogic(message: string, customerId: string, history: HistoryMsg[] = [], bookingsService?: any, enrichedContext?: any, intentAnalysis?: any) {
    // ============================================
    // CONTEXT AWARENESS: Distinguish booking intents early
    // ============================================
    // Get draft early for context awareness checks (will be redeclared later but we need it here)
    const earlyDraft = await this.getOrCreateDraft(customerId);
    
    // Check for existing confirmed bookings
    const existingBooking = bookingsService ? await bookingsService.getLatestConfirmedBooking(customerId) : null;
    
    // Detect if this is FAQ about bookings (not actually booking)
    // Distinguish between:
    // - "How do I make a booking?" / "I want to book" → START BOOKING (BookingStrategy)
    // - "How does the booking process work?" / "What's the booking process?" → FAQ
    // - "How long does booking take?" → FAQ
    const isFaqAboutBookingProcess = /(how.*(does|is|are|work|long|much)|what.*(is|are|the|process|include|cost|amount)|booking.*(process|work|cost|include|policy|hours|refund|cancel)|deposit.*(amount|cost|is)|refund|cancel.*policy|when.*(are|is).*open)/i.test(message);
    const wantsToStartBooking = /(how.*(do|can).*(make|book|start|get|schedule).*(booking|appointment)|(i want|i'd like|i need|can i|please).*(to book|booking|appointment|make.*booking|schedule)|let.*book|start.*booking)/i.test(message);
    
    // If user wants to START booking, don't treat as FAQ
    // If it's informational about booking process/cost/policies, treat as FAQ
    const hasEarlyDraft = !!(earlyDraft && (earlyDraft.service || earlyDraft.date));
    const isFaqAboutBooking = isFaqAboutBookingProcess && !wantsToStartBooking && !hasEarlyDraft;
    
    // If FAQ about booking, let FAQ strategy handle it (don't interfere)
    if (isFaqAboutBooking && !earlyDraft.service && !earlyDraft.date) {
      this.logger.debug('[CONTEXT] Detected FAQ about booking, letting FAQ strategy handle');
      // Continue - let other strategies handle it
    }
    
    // ============================================
    // HANDLE "YES" RESPONSE TO CONNECTION QUESTION
    // ============================================
    // Check if user is confirming they want to be connected with team
    // Look at recent assistant messages (last 3) to find the connection question
    const recentAssistantMsgsForConnection = history
      .filter((msg, idx) => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content)
      .join(' ');
    
    const isConnectionQuestion = recentAssistantMsgsForConnection.includes('connect you with our team') || 
                                 recentAssistantMsgsForConnection.includes('Would you like me to do that for you') ||
                                 recentAssistantMsgsForConnection.includes('Would you like me to do that');
    
    // More flexible pattern to match affirmative responses like "yes do that", "yes please", "do that then", etc.
    const isYesResponse = /(yes|yeah|yep|yup|sure|ok|okay|alright|please|do it|go ahead|do that|that would be|sounds good|that works)/i.test(message.trim());
    
    if (isConnectionQuestion && isYesResponse) {
      // Check if there's an open escalation for this customer
      const openEscalation = await this.prisma.escalation.findFirst({
        where: {
          customerId,
          status: 'OPEN',
          escalationType: 'booking_cancellation'
        },
        orderBy: { createdAt: 'desc' }
      });
      
      if (openEscalation) {
        this.logger.log(`[ESCALATION] Customer ${customerId} confirmed connection request - pausing AI`);
        // Now pause AI since we've confirmed with the customer
        await this.prisma.customer.update({
          where: { id: customerId },
          data: { isAiPaused: true }
        });
        const msg = "Great! I'll connect you with our team right away to assist with canceling your current booking and setting up a new one. They'll be able to guide you through the process and answer any questions you might have. 😊";
        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      } else {
        this.logger.debug(`[ESCALATION] Customer ${customerId} said yes but no open escalation found`);
      }
    }

    // ============================================
    // HANDLE QUESTIONS ABOUT ESCALATION/NOTIFICATION STATUS
    // ============================================
    // Check if customer is asking about whether team has been notified
    const isNotificationStatusQuestion = /(have you|did you|has|have they|were they).*(notif|contact|reach|call|message|connect|escalat|tell|inform)/i.test(message) ||
                                        /(notif|contact|reach|call|message|connect|escalat|tell|inform).*(yet|already|done)/i.test(message) ||
                                        /(when|how long).*(team|they|admin|support|staff)/i.test(message);
    
    if (isNotificationStatusQuestion) {
      // Check if there's an open escalation for this customer
      const openEscalation = await this.prisma.escalation.findFirst({
        where: {
          customerId,
          status: 'OPEN',
        },
        orderBy: { createdAt: 'desc' }
      });
      
      if (openEscalation) {
        this.logger.log(`[ESCALATION] Customer ${customerId} asking about notification status - confirming team has been notified`);
        const msg = "Yes! I've already notified our team about your request. They've been alerted and will reach out to you soon to assist with canceling your current booking and setting up a new one. You should hear from them shortly! 😊";
        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }
    }

    // ============================================
    // CHECK FOR EXTERNAL PEOPLE/ITEMS - CREATE SESSION NOTES
    // ============================================
    // Check ALL messages for mentions of bringing external people or items
    // This runs for every conversation to ensure nothing is missed
    await this.checkAndCreateSessionNote(message, customerId, enrichedContext, history);

    // ============================================
    // CIRCUIT BREAKER - FIRST LINE OF DEFENSE
    // ============================================
    // Detect and break infinite loops automatically
    const breakerCheck = await this.circuitBreaker.checkAndBreak(customerId, history);

    if (breakerCheck.shouldBreak) {
      this.logger.warn(
        `[CIRCUIT_BREAKER] 🔴 TRIPPED for customer ${customerId}: ${breakerCheck.reason || 'Unknown'}`
      );

      // Record the trip for analytics
      await this.circuitBreaker.recordTrip(customerId, breakerCheck.reason || 'Circuit breaker tripped');

      // Clear any problematic draft state
      try {
        const existingDraft = await this.prisma.bookingDraft.findUnique({
          where: { customerId },
        });
        if (existingDraft) {
          await this.prisma.bookingDraft.delete({ where: { customerId } });
          this.logger.log(`[CIRCUIT_BREAKER] Cleared draft for customer ${customerId}`);
        }
      } catch (err) {
        this.logger.error(`[CIRCUIT_BREAKER] Error clearing draft: ${err.message}`);
      }

      // Recovery based on strategy
      let recoveryMessage: string;

      if (breakerCheck.recovery === 'escalate') {
        recoveryMessage = `I apologize for the confusion! 😓 It seems I'm having trouble understanding your request. Let me connect you with our amazing team who can assist you personally!\n\nWould you like someone to call you, or would you prefer to reach out directly at ${this.customerCarePhone}? 💖`;
      } else if (breakerCheck.recovery === 'simplify') {
        recoveryMessage = `Let's start fresh! 🌸 I want to make sure I help you properly. Could you tell me in simple terms what you'd like to do today?\n\nFor example:\n✨ "I want to book a photoshoot"\n✨ "Tell me about your packages"\n✨ "I need to reschedule"\n\nWhat would you like help with? 💖`;
      } else {
        recoveryMessage = `I apologize, but I seem to be having difficulty. Let me help you start fresh! What can I do for you today? 💖`;
      }

      return {
        response: recoveryMessage,
        draft: null,
        updatedHistory: [...history.slice(-this.historyLimit),
        { role: 'user', content: message },
        { role: 'assistant', content: recoveryMessage }
        ]
      };
    }

    // ============================================
    // CONTINUE WITH NORMAL CONVERSATION LOGIC
    // ============================================

    // 0. SANITIZE INPUT
    message = this.sanitizeInput(message);

    // 1. CHECK RATE LIMIT
    const withinLimit = await this.checkRateLimit(customerId);
    if (!withinLimit) {
      this.logger.warn(`Customer ${customerId} exceeded daily token limit`);
      const limitMsg = "I've reached my daily conversation limit with you. Our team will be in touch tomorrow, or you can contact us directly at " + this.customerCarePhone + ". 💖";
      return { response: limitMsg, draft: null, updatedHistory: [...history, { role: 'user', content: message }, { role: 'assistant', content: limitMsg }] };
    }

    // 2. DETECT FRUSTRATION & AUTO-ESCALATE
    const isFrustrated = await this.detectFrustration(message, history);
    if (isFrustrated && this.escalationService) {
      this.logger.log(`[SENTIMENT] Customer ${customerId} showing frustration - auto-escalating`);
      const sentimentScore = 0.8; // High frustration detected
      await this.escalationService.createEscalation(
        customerId,
        'Customer showing signs of frustration (auto-detected)',
        'frustration',
        { sentimentScore, lastMessage: message, historyLength: history.length }
      );
      const escalationMsg = "I sense you might be frustrated, and I'm so sorry! 😔 Let me connect you with a team member who can help you better. Someone will be with you shortly. 💖";
      return { response: escalationMsg, draft: null, updatedHistory: [...history, { role: 'user', content: message }, { role: 'assistant', content: escalationMsg }] };
    }

    // Get or create draft (reuse early draft if we have it, otherwise fetch)
    let draft = earlyDraft || await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    let hasDraft = !!draft;


    // ------------------------------------


    const lower = (message || '').toLowerCase();

    // --- GREETING DETECTION ---
    const greetingKeywords = ['hi', 'hello', 'hey', 'greetings', 'hallo', 'habari', 'good morning', 'good afternoon', 'good evening'];
    // Check if message is essentially just a greeting (allow some punctuation/emojis)
    const cleanMsg = lower.replace(/[^\w\s]/g, '').trim();
    const isGreeting = greetingKeywords.some(kw => cleanMsg === kw || cleanMsg.startsWith(kw + ' '));

    // Only send the special greeting if it's a start of conversation or explicit greeting
    // We allow this even if a draft exists, so a user saying "Hello" gets the proper welcome.
    if (isGreeting) {
      const greetingResponse = `Thank you for contacting Fiesta House Maternity, Kenya’s leading luxury photo studio specializing in maternity photography. We provide an all-inclusive experience in a world-class luxury studio, featuring world-class sets, professional makeup, and a curated selection of luxury gowns. We’re here to ensure your maternity shoot is an elegant, memorable, and stress-free experience.`;
      return {
        response: greetingResponse,
        draft: null,
        updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: greetingResponse }]
      };
    }

    // --- SMART: Detect available hours/times/slots queries ---
    const slotKeywords = [
      'available hours', 'available times', 'available slots', 'what times', 'what hours', 'when can i book',
      'when are you free', 'when is available', 'what time is available', 'what hour is available',
      'slots for', 'hours for', 'times for', 'slots tomorrow', 'hours tomorrow', 'times tomorrow',
      'open slots', 'open hours', 'open times', 'free slots', 'free hours', 'free times',
      'can i book tomorrow', 'can i book on', 'can i come on', 'can i come at', 'can i come tomorrow',
      'when can i come', 'when can i book', 'when is open', 'when are you open', 'when is free',
    ];
    const slotIntent = slotKeywords.some(kw => lower.includes(kw));
    // Also catch patterns like "another free slot", "what's another", "give me another time"
    const anotherSlotPattern = /(another|other|what.*another|what.*other|so what|give me|show me).*(slot|time|hour|free|available)/i;
    // Also catch direct patterns like "available (hours|times|slots) (on|for|tomorrow|today)"
    const slotIntentRegex = /(available|free|open)\s+(hours|times|slots)(\s+(on|for|tomorrow|today|\d{4}-\d{2}-\d{2}))?/i;
    const slotIntentDetected = slotIntent || slotIntentRegex.test(message) || anotherSlotPattern.test(message);

    if (slotIntentDetected) {
      // For "another slot" queries, use draft date/service if available
      const isAnotherSlotQuery = anotherSlotPattern.test(message);
      
      // Try to extract date (e.g., 'tomorrow', 'on 2025-11-20', etc.)
      let dateStr: string | undefined;
      if (isAnotherSlotQuery && draft?.date) {
        // Use draft date for "another slot" queries
        dateStr = draft.date;
      } else if (/tomorrow/.test(lower)) {
        dateStr = DateTime.now().setZone(this.studioTz).plus({ days: 1 }).toFormat('yyyy-MM-dd');
      } else {
        // Try to extract explicit date from message
        const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) dateStr = dateMatch[1];
      }

      // Try to get package/service from draft or message
      let service: string | undefined = isAnotherSlotQuery ? draft?.service : undefined;
      if (!service) {
        service = draft?.service;
      }
      if (!service) {
        // Try to match a known package in the message
        if (this.bookingsService) {
          const allPackages = await this.getCachedPackages();
          const matched = allPackages.find((p: any) => lower.includes(p.name.toLowerCase()));
          if (matched) service = matched.name;
        }
      }

      // If both date and service are present, fetch available slots
      if (dateStr && service) {
        const slots = await this.bookingsService.getAvailableSlotsForDate(dateStr, service);
        if (slots.length === 0) {
          const msg = `Sorry, there are no available slots for ${service} on ${dateStr}. Would you like to try another date or package ? `;
          return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
        // Format slots as pretty times in studio timezone
        const prettySlots = slots.map(s => DateTime.fromISO(s).setZone(this.studioTz).toFormat('HH:mm')).join(', ');
        const msg = `Here are the available times for * ${service} * on * ${dateStr} *: \n${prettySlots} \nLet me know which time works for you!`;
        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }

      // If missing info, prompt for what is missing
      if (!service && !dateStr) {
        const msg = `To show available times, please tell me which package you'd like and for which date (e.g., "Studio Classic tomorrow").`;
        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      } else if (!service) {
        const msg = `Which package would you like to see available times for on ${dateStr}?`;
        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      } else if (!dateStr) {
        const msg = `For which date would you like to see available times for the *${service}* package? (e.g., "tomorrow" or "2025-11-20")`;
        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }
    }

    // --- SMART: Detect booking history queries ---
    const bookingHistoryKeywords = [
      'how many bookings',
      'bookings have i made',
      'my bookings',
      'booking history',
      'how many times have i booked',
      'how many appointments',
      'how many sessions',
      'how many times have i',
    ];

    // Enhanced: Detect requests to VIEW booking details
    const viewBookingsKeywords = [
      'view.*booking',
      'show.*booking',
      'see.*booking',
      'my past booking',
      'past booking',
      'previous booking',
      'last booking',
      'when was my',
      'upcoming booking',
      'next booking',
      'future booking',
    ];

    const isViewBookingsRequest = viewBookingsKeywords.some(kw => new RegExp(kw, 'i').test(lower));
    const isBookingHistoryQuery = bookingHistoryKeywords.some(kw => lower.includes(kw));

    if (isBookingHistoryQuery || isViewBookingsRequest) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

      if (!customer) {
        const msg = `I couldn't find your booking information. Let me help you make your first booking! 💖`;
        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }

      // Get all bookings for this customer
      const allBookings = await this.prisma.booking.findMany({
        where: {
          customerId: customer.id,
        },
        orderBy: { dateTime: 'desc' },
        take: 10, // Show last 10 bookings
      });

      let name = customer?.name || '';
      if (name && name.toLowerCase().startsWith('whatsapp user')) name = '';
      const who = name ? name : (customer?.phone ? customer.phone : 'dear');

      // If they want to VIEW details
      if (isViewBookingsRequest) {
        if (allBookings.length === 0) {
          const msg = `Hi ${who}, you don't have any bookings yet. Would you like to make your first one? 💖`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }

        // Check if asking for last/previous booking
        if (/(last|previous|recent)/.test(lower)) {
          const lastBooking = allBookings[0];
          const dt = DateTime.fromJSDate(lastBooking.dateTime).setZone(this.studioTz);
          const msg = `Your last booking was:\n\n📅 *${lastBooking.service}*\n🗓️ Date: ${dt.toFormat('MMMM dd, yyyy')}\n🕐 Time: ${dt.toFormat('h:mm a')}\n✨ Status: ${lastBooking.status}\n\nWould you like to book another session? 🌸`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }

        // Check if asking for upcoming/next/future bookings
        if (/(upcoming|next|future)/.test(lower)) {
          const now = new Date();
          const upcomingBookings = allBookings.filter(b => b.dateTime > now && b.status === 'confirmed');

          if (upcomingBookings.length === 0) {
            const msg = `You don't have any upcoming bookings scheduled. Would you like to book a session? 💖`;
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          }

          const nextBooking = upcomingBookings[0];
          const dt = DateTime.fromJSDate(nextBooking.dateTime).setZone(this.studioTz);
          const msg = `Your next booking is:\n\n📅 *${nextBooking.service}*\n🗓️ Date: ${dt.toFormat('MMMM dd, yyyy')}\n🕐 Time: ${dt.toFormat('h:mm a')}\n✨ Status: ${nextBooking.status}\n\nWe're so excited to see you! 🌸`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }

        // Show all past bookings
        const bookingList = allBookings.slice(0, 5).map((b, i) => {
          const dt = DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
          return `${i + 1}. *${b.service}* - ${dt.toFormat('MMM dd, yyyy')} at ${dt.toFormat('h:mm a')} (${b.status})`;
        }).join('\n');

        const msg = `Here are your recent bookings:\n\n${bookingList}\n\n${allBookings.length > 5 ? `...and ${allBookings.length - 5} more!\n\n` : ''}Would you like to book another session? 🌸`;
        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }

      // Just counting bookings (original behavior)
      const count = allBookings.length;
      const msg = count === 0
        ? `Hi ${who}, I couldn't find any past bookings for you. Would you like to make your first one? 💖`
        : `Hi ${who}, you've made ${count} booking${count === 1 ? '' : 's'} with us. Thank you for being part of our studio family! Would you like to make another or view your past bookings? 🌸`;
      return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
    }


    // --- SMART: Detect name/number queries ---
    const nameNumberKeywords = [
      'what is my name',
      'whats my name',
      "what's my name",
      'what is my number',
      'whats my number',
      "what's my number",
      'who am i',
      'tell me my name',
      'tell me my number',
    ];
    if (nameNumberKeywords.some(kw => lower.includes(kw))) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      let name = customer?.name || '';
      if (name && name.toLowerCase().startsWith('whatsapp user')) name = '';
      const phone = customer?.phone || customer?.whatsappId || '';
      let msg = '';
      if (name && phone) msg = `Your name is ${name} and your number is ${phone}. 😊`;
      else if (name) msg = `Your name is ${name}. 😊`;
      else if (phone) msg = `Your number is ${phone}. 😊`;
      else msg = `Sorry, I couldn't find your name or number. If you need help updating your profile, let me know!`;
      return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
    }

    // 1. CHECK ESCALATION STATUS
    if (this.escalationService) {
      const isEscalated = await this.escalationService.isCustomerEscalated(customerId);
      if (isEscalated) {
        this.logger.debug(`Skipping AI response for escalated customer ${customerId}`);
        return { response: null, draft: null, updatedHistory: history };
      }
    }

    // 2. DETECT ESCALATION INTENT
    if (/(talk|speak).*(human|person|agent|representative)/i.test(message) || /(stupid|useless|hate|annoying|bad bot)/i.test(message)) {
      if (this.escalationService) {
        this.logger.log(`[ESCALATION] Customer ${customerId} requested handoff`);
        await this.escalationService.createEscalation(customerId, 'User requested human or expressed frustration');
        const msg = "I understand you'd like to speak with a human agent. I've notified our team, and someone will be with you shortly. In the meantime, I'll pause my responses. 💖";
        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }
    }

    // 3. CHECK FOR CANCELLATION CONFIRMATION FIRST
    // Handle "yes" response to cancellation confirmation prompt
    const lastAssistantMsgsForCancel = history
      .filter((msg) => msg.role === 'assistant')
      .slice(-2)
      .map(msg => msg.content)
      .join(' ');
    
    const isCancellationConfirmationPrompt = lastAssistantMsgsForCancel.includes('Are you sure you want to cancel') ||
                                            lastAssistantMsgsForCancel.includes('Reply \'yes\' to confirm cancellation') ||
                                            lastAssistantMsgsForCancel.includes('confirm cancellation');
    
    if (isCancellationConfirmationPrompt) {
      const isConfirmationResponse = /^(yes|yeah|yep|yup|sure|confirm|please|do it|go ahead|ok|okay)$/i.test(message.trim());
      
      if (isConfirmationResponse) {
        // Check if there's a confirmed booking to cancel
        const confirmedBooking = await this.bookingsService?.getLatestConfirmedBooking(customerId);
        if (confirmedBooking) {
          try {
            await this.bookingsService.cancelBooking(confirmedBooking.id);
            this.logger.log(`[CANCELLATION] Customer ${customerId} confirmed cancellation - booking ${confirmedBooking.id} cancelled`);
            const msg = "All set! I've cancelled your booking. We hope to see you again soon! 💖 If you'd like to make a new booking, just let me know!";
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          } catch (error) {
            this.logger.error(`[CANCELLATION] Failed to cancel booking: ${error.message}`);
            
            // If cancellation failed due to 72-hour policy, escalate to admin
            if (error.message.includes('72 hours')) {
              const bookingDate = DateTime.fromJSDate(confirmedBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
              
              // Create escalation for admin intervention
              if (this.escalationService) {
                try {
                  const escalation = await this.prisma.escalation.create({
                    data: {
                      customerId,
                      reason: `Customer wants to cancel booking within 72-hour window (${bookingDate}) - requires admin approval`,
                      status: 'OPEN',
                      escalationType: 'booking_cancellation',
                      metadata: {
                        existingBookingId: confirmedBooking.id,
                        existingBookingDate: confirmedBooking.dateTime,
                        existingService: confirmedBooking.service,
                        action: 'cancel_within_72_hours',
                        policyViolation: true
                      }
                    },
                    include: { customer: true }
                  });
                  
                  // Emit WebSocket event
                  if (this.websocketGateway) {
                    try {
                      this.websocketGateway.emitNewEscalation(escalation);
                    } catch (wsError) {
                      this.logger.error(`Failed to emit escalation WebSocket event: ${wsError.message}`);
                    }
                  }
                  
                  this.logger.log(`[ESCALATION] Created cancellation escalation for customer ${customerId} due to 72-hour policy`);
                } catch (escalationError) {
                  this.logger.error(`Failed to create escalation: ${escalationError.message}`);
                }
              }
              
              // Create admin notification
              await this.createEscalationAlert(
                customerId,
                'reschedule_request',
                'Booking Cancellation Request - Policy Exception',
                `Customer wants to cancel their booking on ${bookingDate} but it's within the 72-hour cancellation window. Manual approval required.`,
                {
                  existingBookingId: confirmedBooking.id,
                  existingBookingDate: confirmedBooking.dateTime,
                  existingService: confirmedBooking.service,
                  action: 'cancel_within_72_hours',
                  policyViolation: true
                }
              );
              
              const errorMsg = "I understand you'd like to cancel your booking. Since it's within 72 hours of your appointment, I've notified our team to assist you with this request. They'll reach out to you shortly to help with the cancellation. 😊";
              return { response: errorMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: errorMsg }] };
            } else {
              // Other cancellation errors - also escalate
              const bookingDate = DateTime.fromJSDate(confirmedBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
              
              if (this.escalationService) {
                try {
                  const escalation = await this.prisma.escalation.create({
                    data: {
                      customerId,
                      reason: `Customer wants to cancel booking (${bookingDate}) but encountered an error - requires admin assistance`,
                      status: 'OPEN',
                      escalationType: 'booking_cancellation',
                      metadata: {
                        existingBookingId: confirmedBooking.id,
                        existingBookingDate: confirmedBooking.dateTime,
                        existingService: confirmedBooking.service,
                        action: 'cancel_error',
                        error: error.message
                      }
                    },
                    include: { customer: true }
                  });
                  
                  if (this.websocketGateway) {
                    try {
                      this.websocketGateway.emitNewEscalation(escalation);
                    } catch (wsError) {
                      this.logger.error(`Failed to emit escalation WebSocket event: ${wsError.message}`);
                    }
                  }
                } catch (escalationError) {
                  this.logger.error(`Failed to create escalation: ${escalationError.message}`);
                }
              }
              
              await this.createEscalationAlert(
                customerId,
                'reschedule_request',
                'Booking Cancellation Error - Admin Assistance Required',
                `Customer wants to cancel their booking on ${bookingDate} but encountered an error: ${error.message}. Manual intervention required.`,
                {
                  existingBookingId: confirmedBooking.id,
                  existingBookingDate: confirmedBooking.dateTime,
                  existingService: confirmedBooking.service,
                  action: 'cancel_error',
                  error: error.message
                }
              );
              
              const errorMsg = "I encountered an issue canceling your booking. I've notified our team to assist you with this request. They'll reach out to you shortly. 😊";
              return { response: errorMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: errorMsg }] };
            }
          }
        }
      }
    }

    // 4. ENHANCED CANCELLATION DETECTION (moved before booking flow to catch cancel intent early)
    // Detect broader cancellation patterns including "cancel everything", "start over", etc.
    const cancelPatterns = [
      /(cancel).*(everything|all|booking|appointment|session|it)/i,
      /(delete|clear).*(everything|all|booking|draft)/i,
      /(start|begin).*(over|fresh|again|new)/i,
      /^(forget it|never ?mind|cancel)$/i,
      /(stop|quit|end).*(booking|appointment|session|it)/i,
      /(i changed my mind|never mind|forget about it|on second thought)/i,
    ];
    const isCancelIntent = cancelPatterns.some(pattern => pattern.test(message));

    if (isCancelIntent) {
      this.logger.log(`[CANCELLATION] Detected cancel intent: "${message}"`);

      // Check if there's a draft to cancel
      if (draft) {
        await this.prisma.bookingDraft.delete({ where: { customerId } });
        this.logger.log(`[CANCELLATION] Deleted draft for customer ${customerId}`);
      }

      // Check if there's a confirmed booking to cancel
      const confirmedBooking = await this.bookingsService?.getLatestConfirmedBooking(customerId);
      if (confirmedBooking) {
        // Ask for confirmation before canceling a confirmed booking
        if (/(yes|sure|confirm|please|do it|go ahead)/i.test(message)) {
          await this.bookingsService.cancelBooking(confirmedBooking.id);
          const msg = "All set! I've cancelled your booking. We hope to see you again soon! 💖 If you'd like to make a new booking, just let me know!";
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        } else {
          const bookingDate = DateTime.fromJSDate(confirmedBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy');
          const msg = `You have a confirmed booking on ${bookingDate}. Are you sure you want to cancel it? Reply 'yes' to confirm cancellation.`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
      }

      // If only draft was cancelled or nothing to cancel
      const msg = draft
        ? "No problem! I've cleared your booking draft. Feel free to start fresh whenever you're ready! 💖"
        : "I don't see any active bookings or drafts to cancel. Would you like to start a new booking? 🌸";
      return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
    }

    // 3.4 HANDLE RESCHEDULE CONFIRMATION STATE
    // This must come BEFORE the general reschedule detection to handle the confirmation flow
    if (draft && draft.step === 'reschedule_confirm') {
      this.logger.log(`[RESCHEDULE] In confirmation state for customer ${customerId}`);

      if (/(yes|confirm|do it|sure|okay|fine|go ahead|please|yep|yeah)/i.test(message)) {
        const bookingId = draft.bookingId; // Booking ID stored here
        const newDateObj = new Date(draft.dateTimeIso);

        if (bookingId && draft.dateTimeIso) {
          await this.bookingsService.updateBooking(bookingId, { dateTime: newDateObj });
          await this.prisma.bookingDraft.delete({ where: { customerId } });

          const msg = `✅ Done! Your appointment has been rescheduled to *${DateTime.fromJSDate(newDateObj).setZone(this.studioTz).toFormat('ccc, LLL dd, yyyy \'at\' h:mm a')}*. See you then! 💖`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        } else {
          const msg = "I couldn't find the booking details to update. Please try again or contact support. 😓";
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
      } else if (/(no|cancel|different|another|change)/i.test(message)) {
        // User wants a different time
        await this.prisma.bookingDraft.update({
          where: { customerId },
          data: {
            step: 'reschedule',
            date: null,
            time: null,
            dateTimeIso: null
          }
        });
        const msg = "No problem! What date and time would you prefer instead? 🗓️";
        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      } else {
        // User said something else - remind them to confirm
        const prettyDate = DateTime.fromISO(draft.dateTimeIso).setZone(this.studioTz).toFormat('ccc, LLL dd, yyyy \'at\' h:mm a');
        const msg = `I'm waiting for your confirmation to reschedule to *${prettyDate}*. Please reply "YES" to confirm or "NO" if you'd like a different time. 💖`;
        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
      }
    }

    // 3.5 DETECT RESCHEDULING (MOVED BEFORE NEW BOOKING CHECK)
    // If the user explicitly says "reschedule" or similar, OR if we are already in a rescheduling flow (draft.step === 'reschedule')
    // IMPORTANT: Check this BEFORE "new booking" intent to prevent "make a reschedule" from matching "make...booking"
    const isRescheduleIntent =
      /\b(reschedul\w*)\b/i.test(message) || // Matches "reschedule", "rescheduling", etc. standalone
      /(i want to|i'd like to|i need to|can i|can we).*reschedule/i.test(message) || // "i want to reschedule", "can we reschedule"
      /(change|move|modify).*(booking|appointment|date|time)/i.test(message);

    // Check if user is responding to "which booking" question (even without explicit reschedule keyword)
    const recentRescheduleMsgs = history
      .filter((msg) => msg.role === 'assistant')
      .slice(-2)
      .map(msg => msg.content)
      .join(' ');
    const isRespondingToBookingSelection = 
      /Which one would you like to reschedule/i.test(recentRescheduleMsgs) ||
      /upcoming bookings/i.test(recentRescheduleMsgs);

    if (isRescheduleIntent || (draft && draft.step === 'reschedule') || isRespondingToBookingSelection) {
      this.logger.log(`[RESCHEDULE] Detected intent or active flow for customer ${customerId}, draft step: ${draft?.step}, bookingId: ${draft?.bookingId}`);

      // CRITICAL: Refresh draft from database to ensure we have the latest state
      // This is important because the draft might have been updated by mergeIntoDraft or other processes
      let currentDraft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
      if (!currentDraft && draft) {
        currentDraft = draft; // Fallback to the draft we already have
      }

      // If user explicitly says "i want to reschedule" and there's a booking draft, clear it first
      // This allows them to reschedule an existing booking instead of continuing the new booking
      if (isRescheduleIntent && currentDraft && currentDraft.step !== 'reschedule' && currentDraft.step !== 'reschedule_confirm' && !currentDraft.bookingId) {
        this.logger.log(`[RESCHEDULE] User wants to reschedule, clearing existing booking draft`);
        await this.prisma.bookingDraft.delete({ where: { customerId } }).catch(() => {
          // Ignore if draft doesn't exist
        });
        currentDraft = null; // Reset draft so we start fresh
        draft = null; // Also reset the local draft variable
      }

      // If this is a new request (not yet in reschedule step), setup the draft
      // CRITICAL: Also check if draft.step === 'reschedule_confirm' - don't re-enter setup in that case
      // This prevents re-running the 72-hour check when user provides new date/time
      // Also check if draft has bookingId - if it does, we're already in reschedule mode
      const isAlreadyInReschedule = currentDraft && (currentDraft.step === 'reschedule' || currentDraft.step === 'reschedule_confirm' || currentDraft.bookingId);
      
      this.logger.log(`[RESCHEDULE] isAlreadyInReschedule: ${isAlreadyInReschedule}, currentDraft step: ${currentDraft?.step}, bookingId: ${currentDraft?.bookingId}`);
      
      if (!isAlreadyInReschedule) {
        this.logger.log(`[RESCHEDULE] Setting up new reschedule request for customer ${customerId}`);
        // Get ALL confirmed bookings for this customer
        const allBookings = await this.prisma.booking.findMany({
          where: {
            customerId,
            status: 'confirmed',
            dateTime: { gte: new Date() }, // Only future bookings
          },
          orderBy: { dateTime: 'asc' },
        });

        if (allBookings.length === 0) {
          const msg = "I'd love to help you reschedule, but I can't find a current booking for you. Would you like to make a new one? 💖";
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }

        let targetBooking = allBookings[0]; // Default to first (earliest) booking
        let dateMatch = null;

        // SMART: Try to parse which booking they're referring to from the message
        // First try: full date with month (e.g., "reschedule the one on 6th Dec" or "move my Dec 6th appointment")
        dateMatch = message.match(/(\d{1,2})(st|nd|rd|th)?\s*(dec|december|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november)/i);

        if (dateMatch && allBookings.length > 1) {
          const day = parseInt(dateMatch[1]);
          const monthStr = dateMatch[3].toLowerCase();
          const monthMap: any = {
            jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
            apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
            aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
            nov: 10, november: 10, dec: 11, december: 11
          };
          const month = monthMap[monthStr];

          // Find booking that matches this date
          const matchedBooking = allBookings.find(b => {
            const bookingDt = DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
            return bookingDt.month === month + 1 && bookingDt.day === day;
          });

          if (matchedBooking) {
            targetBooking = matchedBooking;
            this.logger.log(`[RESCHEDULE] User specified booking on ${day} ${monthStr}, matched booking ID ${matchedBooking.id}`);
          }
        } else if (isRespondingToBookingSelection && allBookings.length > 1) {
          // Second try: day-only match (e.g., "the one on 15th" or "15th" or "15")
          // This handles cases where user responds to "which booking" question without specifying month
          const dayOnlyMatch = message.match(/(?:the one on |on )?(\d{1,2})(?:st|nd|rd|th)?/i);
          if (dayOnlyMatch) {
            const day = parseInt(dayOnlyMatch[1]);
            // Find booking that matches this day (check all bookings for matching day)
            const matchedBookings = allBookings.filter(b => {
              const bookingDt = DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
              return bookingDt.day === day;
            });

            if (matchedBookings.length === 1) {
              targetBooking = matchedBookings[0];
              dateMatch = dayOnlyMatch; // Mark as matched so we don't ask again
              this.logger.log(`[RESCHEDULE] User specified booking on day ${day}, matched booking ID ${targetBooking.id}`);
            } else if (matchedBookings.length > 1) {
              // Multiple bookings on same day - ask for more specificity
              const bookingsList = matchedBookings.map((b, idx) => {
                const dt = DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
                return `${idx + 1}️⃣ ${b.service} on ${dt.toFormat('MMM dd, yyyy')} at ${dt.toFormat('h:mm a')}`;
              }).join('\n');
              const msg = `I found ${matchedBookings.length} bookings on the ${day}${this.getOrdinalSuffix(day)}:\n\n${bookingsList}\n\nWhich one would you like to reschedule? Please specify the time or service name. 🗓️`;
              return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
          }
        }

        // If user has multiple bookings and didn't specify which one, ask them
        if (allBookings.length > 1 && !dateMatch && !isRespondingToBookingSelection) {
          const bookingsList = allBookings.map((b, idx) => {
            const dt = DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
            return `${idx + 1}️⃣ ${b.service} on ${dt.toFormat('MMM dd, yyyy')} at ${dt.toFormat('h:mm a')}`;
          }).join('\n');

          const msg = `You have ${allBookings.length} upcoming bookings:\n\n${bookingsList}\n\nWhich one would you like to reschedule? Just tell me the date (e.g., "the one on Dec 6th") 🗓️`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }

        // Check 72-hour rule before allowing reschedule
        const now = new Date();
        const bookingTime = new Date(targetBooking.dateTime);
        const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        if (hoursDiff < 72 && hoursDiff > 0) {
          // Create admin alert for reschedule request within 72 hours
          const bookingDt = DateTime.fromJSDate(targetBooking.dateTime).setZone(this.studioTz);
          await this.createEscalationAlert(
            customerId,
            'reschedule_request',
            'Reschedule Request - Within 72 Hours',
            `Customer requested to reschedule booking "${targetBooking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
            {
              bookingId: targetBooking.id,
              hoursUntilBooking: Math.round(hoursDiff),
              originalDateTime: targetBooking.dateTime,
            }
          );

          const msg = `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`;
          return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }

        // Create/Update draft to 'reschedule' mode with the specific booking ID
        draft = await this.prisma.bookingDraft.upsert({
          where: { customerId },
          update: {
            step: 'reschedule',
            service: targetBooking.service,
            name: targetBooking.recipientName || '',
            date: null,
            time: null,
            dateTimeIso: null,
            bookingId: targetBooking.id,
          },
          create: {
            customerId,
            step: 'reschedule',
            service: targetBooking.service,
            name: targetBooking.recipientName || '',
            bookingId: targetBooking.id,
          },
        });

        // If the user ALREADY provided a date in this message (e.g. "Reschedule to next Friday"), extract it now
        const extraction = await this.extractBookingDetails(message, history);
        if (extraction.date || extraction.time) {
          // Merge immediately
          draft = await this.mergeIntoDraft(customerId, extraction);
          // Restore the booking ID after merge (merge might overwrite it)
          await this.prisma.bookingDraft.update({
            where: { customerId },
            data: { recipientPhone: targetBooking.id }
          });
        } else {
          const bookingDt = DateTime.fromJSDate(targetBooking.dateTime).setZone(this.studioTz);
          const msg = `I can certainly help reschedule your ${targetBooking.service} appointment on ${bookingDt.toFormat('MMM dd')}! 🗓️ When would you like to move it to?`;
          return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
      }

      // Continue with reschedule flow (extraction and availability check)
      // This is handled by the code that follows below...
      // For now, we'll let it fall through to the normal reschedule handling
    }

    // 4. CHECK FOR NUMERIC OPTION SELECTIONS (1, 2, 3) FIRST
    // This handles when customer selects an option after being shown choices
    const recentAssistantMsgs = history
      .filter((msg) => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content)
      .join(' ');
    
    const hasOptionPrompt = recentAssistantMsgs.includes('1️⃣') || 
                            recentAssistantMsgs.includes('2️⃣') || 
                            recentAssistantMsgs.includes('3️⃣') ||
                            /Would you like to:/.test(recentAssistantMsgs) ||
                            /Cancel that booking and create/.test(recentAssistantMsgs);
    
    if (hasOptionPrompt) {
      const existingBooking = await this.bookingsService?.getLatestConfirmedBooking(customerId);
      
      if (existingBooking) {
        // Check for numeric choices (1, 2, 3) or text patterns
        const isOption1 = /^1\s*$|^1️⃣\s*$/i.test(message.trim()) || /(cancel|delete).*(existing|old|that|booking)/i.test(message);
        const isOption2 = /^2\s*$|^2️⃣\s*$/i.test(message.trim()) || /(modify|reschedule|change).*(existing|it)/i.test(message);
        const isOption3 = /^3\s*$|^3️⃣\s*$/i.test(message.trim()) || /(different|another).*(date|time)/i.test(message);
        const hasChoice = isOption1 || isOption2 || isOption3;

        if (hasChoice) {
          if (isOption1) {
            // Option 1: Cancel existing and create fresh - ESCALATE TO ADMIN
            this.logger.log(`[ESCALATION] Customer ${customerId} selected option 1 - wants to cancel existing booking and create new one - escalating to admin`);
            
            // Create escalation (but don't pause AI yet - we need to send confirmation)
            if (this.escalationService) {
              const bookingDate = DateTime.fromJSDate(existingBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
              // Create escalation record without pausing AI yet
              const escalation = await this.prisma.escalation.create({
                data: {
                  customerId,
                  reason: `Customer wants to cancel existing booking (${bookingDate}) and create a fresh new booking`,
                  status: 'OPEN',
                  escalationType: 'booking_cancellation',
                  metadata: {
                    existingBookingId: existingBooking.id,
                    existingBookingDate: existingBooking.dateTime,
                    existingService: existingBooking.service,
                    action: 'cancel_and_create_new'
                  }
                },
                include: { customer: true }
              });
              this.logger.log(`[ESCALATION] Created booking cancellation escalation for customer ${customerId}`);
              
              // Emit WebSocket event manually since we're creating directly
              if (this.websocketGateway) {
                try {
                  this.websocketGateway.emitNewEscalation(escalation);
                } catch (error) {
                  this.logger.error(`Failed to emit escalation WebSocket event: ${error.message}`);
                }
              }
            }

            // Create admin notification
            const bookingDate = DateTime.fromJSDate(existingBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
            await this.createEscalationAlert(
              customerId,
              'reschedule_request',
              'Booking Cancellation & New Booking Request',
              `Customer wants to cancel their existing booking on ${bookingDate} and create a fresh new booking. Please assist with cancellation and new booking setup.`,
              {
                existingBookingId: existingBooking.id,
                existingBookingDate: existingBooking.dateTime,
                existingService: existingBooking.service,
                action: 'cancel_and_create_new'
              }
            );

            const msg = "Got it! To cancel your current booking and create a fresh one, I'll need to connect you with our team to finalize the details. Would you like me to do that for you? 😊";
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          } else if (isOption2) {
            // Redirect to reschedule
            draft = await this.prisma.bookingDraft.upsert({
              where: { customerId },
              update: { step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
              create: { customerId, step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
            });
            const msg = "Perfect! When would you like to reschedule your appointment to? 🗓️";
            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          } else if (isOption3) {
            // Different date choice - clear conflict and continue
            if (draft) {
              await this.prisma.bookingDraft.update({
                where: { customerId },
                data: { conflictResolution: 'different_time', date: null, time: null, dateTimeIso: null }
              });
            } else {
              draft = await this.prisma.bookingDraft.create({
                data: { customerId, step: 'service', conflictResolution: 'different_time' }
              });
            }
            const msg = "Got it! Let's book for a different date. Which package would you like? 🌸";
            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          }
        }
      }
    }

    // 5. DETECT "NEW BOOKING" INTENT WITH EXISTING BOOKING
    // Handle when user explicitly wants a new/fresh booking despite having an existing one
    const newBookingPatterns = [
      /(new|fresh|another|different).*(booking|appointment|session)/i,
      /(create|make|start).*(new|fresh|another).*(booking)/i,
      /^(book|new booking|fresh booking)$/i,
    ];
    const isNewBookingIntent = newBookingPatterns.some(pattern => pattern.test(message));

    if (isNewBookingIntent) {
      // Check if they have an existing confirmed booking
      const existingBooking = await this.bookingsService?.getLatestConfirmedBooking(customerId);

      if (existingBooking) {
        this.logger.log(`[NEW BOOKING] User wants new booking but has existing booking on ${existingBooking.dateTime}`);

        // Check if user has already made a choice
        if (draft?.conflictResolution === 'cancel_existing') {
          // User already chose to cancel existing, proceed with cancellation
          await this.bookingsService.cancelBooking(existingBooking.id);
          await this.prisma.bookingDraft.update({
            where: { customerId },
            data: { conflictResolution: null } // Clear the choice
          });
          this.logger.log(`[NEW BOOKING] Cancelled existing booking ${existingBooking.id}, proceeding with new booking`);
          // Let the flow continue to booking creation
        } else if (draft?.conflictResolution === 'modify_existing') {
          // Redirect to reschedule flow
          draft = await this.prisma.bookingDraft.upsert({
            where: { customerId },
            update: { step: 'reschedule', service: existingBooking.service, conflictResolution: null },
            create: { customerId, step: 'reschedule', service: existingBooking.service },
          });
          const msg = "Great! Let's reschedule your existing booking. When would you like to move it to? 🗓️";
          return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        } else {
          // User hasn't chosen yet, check if this message contains their choice
          // Check for numeric choices (1, 2, 3) or text patterns
          const isOption1 = /^1\s*$|^1️⃣\s*$/i.test(message.trim()) || /(cancel|delete).*(existing|old|that|booking)/i.test(message);
          const isOption2 = /^2\s*$|^2️⃣\s*$/i.test(message.trim()) || /(modify|reschedule|change).*(existing|it)/i.test(message);
          const isOption3 = /^3\s*$|^3️⃣\s*$/i.test(message.trim()) || /(different|another).*(date|time)/i.test(message);
          const hasChoice = isOption1 || isOption2 || isOption3;

          if (hasChoice) {
            if (isOption1) {
              // Option 1: Cancel existing and create fresh - ESCALATE TO ADMIN
              this.logger.log(`[ESCALATION] Customer ${customerId} wants to cancel existing booking and create new one - escalating to admin`);
              
              // Create escalation (but don't pause AI yet - we need to send confirmation)
              if (this.escalationService) {
                const bookingDate = DateTime.fromJSDate(existingBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
                // Create escalation record without pausing AI yet
                const escalation = await this.prisma.escalation.create({
                  data: {
                    customerId,
                    reason: `Customer wants to cancel existing booking (${bookingDate}) and create a fresh new booking`,
                    status: 'OPEN',
                    escalationType: 'booking_cancellation',
                    metadata: {
                      existingBookingId: existingBooking.id,
                      existingBookingDate: existingBooking.dateTime,
                      existingService: existingBooking.service,
                      action: 'cancel_and_create_new'
                    }
                  },
                  include: { customer: true }
                });
                this.logger.log(`[ESCALATION] Created booking cancellation escalation for customer ${customerId}`);
                
                // Emit WebSocket event manually since we're creating directly
                if (this.websocketGateway) {
                  try {
                    this.websocketGateway.emitNewEscalation(escalation);
                  } catch (error) {
                    this.logger.error(`Failed to emit escalation WebSocket event: ${error.message}`);
                  }
                }
              }

              // Create admin notification
              const bookingDate = DateTime.fromJSDate(existingBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
              await this.createEscalationAlert(
                customerId,
                'reschedule_request',
                'Booking Cancellation & New Booking Request',
                `Customer wants to cancel their existing booking on ${bookingDate} and create a fresh new booking. Please assist with cancellation and new booking setup.`,
                {
                  existingBookingId: existingBooking.id,
                  existingBookingDate: existingBooking.dateTime,
                  existingService: existingBooking.service,
                  action: 'cancel_and_create_new'
                }
              );

              const msg = "Got it! To cancel your current booking and create a fresh one, I'll need to connect you with our team to finalize the details. Would you like me to do that for you? 😊";
              return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            } else if (isOption2) {
              // Redirect to reschedule
              draft = await this.prisma.bookingDraft.upsert({
                where: { customerId },
                update: { step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
                create: { customerId, step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
              });
              const msg = "Perfect! When would you like to reschedule your appointment to? 🗓️";
              return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            } else if (isOption3) {
              // Different date choice - clear conflict and continue
              if (draft) {
                await this.prisma.bookingDraft.update({
                  where: { customerId },
                  data: { conflictResolution: 'different_time', date: null, time: null, dateTimeIso: null }
                });
              } else {
                draft = await this.prisma.bookingDraft.create({
                  data: { customerId, step: 'service', conflictResolution: 'different_time' }
                });
              }
              const msg = "Got it! Let's book for a different date. Which package would you like? 🌸";
              return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
          } else {
            // Present options
            const bookingDate = DateTime.fromJSDate(existingBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
            const msg = `I see you have a booking scheduled for ${bookingDate}. 💖\n\nWould you like to:\n1️⃣ Cancel that booking and create a fresh one\n2️⃣ Modify/reschedule your existing booking\n3️⃣ Keep it and book for a different date\n\nJust let me know what works best for you!`;
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          }
        }
      }
      // If no existing booking, continue with normal booking flow
    }

    // 5. CONTINUE RESCHEDULE FLOW (if we're in reschedule mode)
    // This handles the rest of the reschedule logic after the initial setup above
    // CRITICAL: Refresh draft from database to ensure we have the latest state
    let rescheduleDraft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    if (!rescheduleDraft && draft) {
      rescheduleDraft = draft; // Fallback to the draft we already have
    }
    
    if (rescheduleDraft && (rescheduleDraft.step === 'reschedule' || rescheduleDraft.step === 'reschedule_confirm')) {
      this.logger.log(`[RESCHEDULE] Continuing reschedule flow for customer ${customerId}, draft step: ${rescheduleDraft.step}, bookingId: ${rescheduleDraft.bookingId}`);
      draft = rescheduleDraft; // Update local draft variable for consistency

      // CRITICAL FIX: If user asks an FAQ/general question while in reschedule mode,
      // bypass the reschedule flow and answer their question instead of staying stuck
      const faqPatterns = [
        /what (is|are|was|were)/i,
        /(tell|show|explain|describe).*(me|about)/i,
        /(how|when|where|why)/i,
        /my (last|latest|previous|current|next)/i,
        /(package|booking|appointment).*(did|have|choose|select|pick)/i,
      ];

      const isFaqQuestion = faqPatterns.some(pattern => pattern.test(message));

      if (isFaqQuestion && !/(to|for|at|on)\s+\d/i.test(message)) { // Not if they're saying "on the 5th" etc
        this.logger.log(`[RESCHEDULE] User asked FAQ question while in reschedule mode, routing to FAQ`);
        const faqResponse = await this.answerFaq(message, history, undefined, customerId);
        const responseText = typeof faqResponse === 'object' && 'text' in faqResponse ? faqResponse.text : faqResponse;
        // Don't clear the draft - they might still want to reschedule after getting info
        return { response: responseText, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: responseText as string }] };
      }

      // --- Handle Rescheduling Flow (draft.step === 'reschedule') ---

      // 1. Extract details from current message
      const extraction = await this.extractBookingDetails(message, history);
      draft = await this.mergeIntoDraft(customerId, extraction);

      // 2. Check if we have a valid date/time candidate
      if (draft.date && draft.time) {
        const normalized = this.normalizeDateTime(draft.date, draft.time);
        if (normalized) {
          const newDateObj = new Date(normalized.isoUtc);

          // 1. Check for conflicts first (exclude the booking being rescheduled)
          const excludeBookingId = draft.bookingId || undefined;
          const conflictResult = await this.checkBookingConflicts(customerId, newDateObj, excludeBookingId, draft.service);
          if (conflictResult.conflict) {
            const msg = `I'm sorry, but it looks like you already have a booking around that time. ${conflictResult.conflict} Would you like to try a different time?`;
            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          }

          // Check availability
          const avail = await this.bookingsService.checkAvailability(newDateObj, draft.service);
          if (!avail.available) {
            const suggestions = (avail.suggestions || []).slice(0, 3).map((s: string | Date) => {
              const dt = typeof s === 'string' ? DateTime.fromISO(s) : DateTime.fromJSDate(new Date(s));
              return dt.setZone(this.studioTz).toLocaleString(DateTime.DATETIME_MED);
            });
            const msg = `I checked that time, but it's currently unavailable. 😔\nHere are some nearby times that are open: ${suggestions.join(', ')}.\nDo any of those work for you?`;
            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
          }

          // Time is available - update draft to confirmation state and ask for explicit confirmation
          await this.prisma.bookingDraft.update({
            where: { customerId },
            data: {
              step: 'reschedule_confirm',
              dateTimeIso: normalized.isoUtc
            }
          });

          // Present the slot and ask to confirm
          const prettyDate = DateTime.fromJSDate(newDateObj).setZone(this.studioTz).toFormat('ccc, LLL dd, yyyy \'at\' h:mm a');
          const msg = `Great! I found an available slot on *${prettyDate}*. 🎉\n\nTo confirm this reschedule, please reply with "YES" or "CONFIRM". If you'd like a different time, just let me know! 💖`;
          return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
      }

      // If we are here, we are in reschedule mode but don't have a full date/time yet, or extraction failed
      const msg = "Please let me know the new date and time you'd like. (e.g., 'Next Friday at 2pm') 🗓️";
      return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
    }


    // SMART ACTION DETECTION: Send immediate reminder (broadened to catch more variations)
    const isReminderAction = (
      (/(send|give|text|message).*(reminder|message|notification|it)/i.test(message) && /(again|now|right now|immediately|asap|today)/i.test(message)) ||
      /(send|text|message).*(her|him|them).*(reminder|again)/i.test(message) ||
      /(remind|text|message).*(her|him|them).*(now|again|please)/i.test(message)
    );

    if (isReminderAction) {
      this.logger.log(`[SMART ACTION] Manual reminder request detected: "${message}"`);

      // Find the most recent booking for this customer
      const recentBooking = await this.prisma.booking.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        include: { customer: true }
      });

      if (recentBooking) {
        const bookingDt = DateTime.fromJSDate(recentBooking.dateTime).setZone(this.studioTz);
        const formattedDate = bookingDt.toFormat('MMMM d, yyyy');
        const formattedTime = bookingDt.toFormat('h:mm a');
        const recipientName = recentBooking.recipientName || recentBooking.customer?.name || 'there';
        const recipientPhone = recentBooking.recipientPhone || recentBooking.customer?.phone;

        if (recipientPhone) {
          const reminderMessage =
            `Hi ${recipientName}! 💖\n\n` +
            `This is a friendly reminder about your upcoming maternity photoshoot ` +
            `on *${formattedDate} at ${formattedTime}*. ` +
            `We're so excited to capture your beautiful moments! ✨📸\n\n` +
            `If you have any questions, feel free to reach out. See you soon! 🌸`;

          try {
            // Send via messages service to the recipient
            await this.messagesService.sendOutboundMessage(
              recipientPhone,
              reminderMessage,
              'whatsapp'
            );

            this.logger.log(`[SMART ACTION] Sent manual reminder to ${recipientPhone} for booking ${recentBooking.id}`);

            const confirmMsg = `Done! ✅ I've just sent a lovely reminder to ${recipientName} at ${recipientPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}. She should receive it shortly. 💖`;
            return { response: confirmMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: confirmMsg }] };
          } catch (err) {
            this.logger.error('[SMART ACTION] Failed to send manual reminder', err);
            const errorMsg = `I tried to send the reminder, but encountered an issue. Could you please check the phone number or try again? 💕`;
            return { response: errorMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: errorMsg }] };
          }
        } else {
          const noPhoneMsg = `I'd love to send that reminder, but I don't have a phone number for ${recipientName}. Could you provide it? 🌸`;
          return { response: noPhoneMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: noPhoneMsg }] };
        }
      } else {
        const noBookingMsg = `I'd be happy to send a reminder, but I don't see any booking details yet. Would you like to book a session first? 💖`;
        return { response: noBookingMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: noBookingMsg }] };
      }
    }

    // Handle WhatsApp number confirmation for bookings
    if (hasDraft && /(yes|yeah|yep|correct|that'?s? right|it is|yess)/i.test(message) && /(whatsapp|number|phone|reach)/i.test(lower)) {
      this.logger.log(`[SMART EXTRACTION] Detected WhatsApp number confirmation: "${message}"`);
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });

      if (customer?.phone && !draft.recipientPhone) {
        // User confirmed to use customer's WhatsApp number as recipient phone
        await this.prisma.bookingDraft.update({
          where: { customerId },
          data: { recipientPhone: customer.phone }
        });
        this.logger.log(`[SMART EXTRACTION] Set recipientPhone to customer phone: ${customer.phone}`);
        // Reload draft
        draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
      }
    }

    // Business name query detection
    const businessNameKeywords = ['business name', 'what is the business called', 'who are you', 'company name', 'studio name', 'what is this place', 'what is this business', 'what is your name'];
    if (businessNameKeywords.some((kw) => lower.includes(kw))) {
      const nameResponse = `Our business is called ${this.businessName}. If you have any questions about our services or need assistance, I'm here to help! 😊`;
      const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: nameResponse }];
      return { response: nameResponse, draft: null, updatedHistory };
    }

    // New location query detection: check for keywords relating to location
    const locationQueryKeywords = ['location', 'where', 'address', 'located', 'studio location', 'studio address', 'where are you', 'where is the studio', 'studio address'];
    if (locationQueryKeywords.some((kw) => lower.includes(kw))) {
      const locationResponse = `Our business is called ${this.businessName}. ${this.businessLocation}`;
      const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: locationResponse }];
      return { response: locationResponse, draft: null, updatedHistory };
    }

    // Website query detection
    const websiteQueryKeywords = ['website', 'web address', 'url', 'online', 'site', 'web page', 'webpage'];
    if (websiteQueryKeywords.some((kw) => lower.includes(kw))) {
      const websiteResponse = `You can visit our website at ${this.businessWebsite} to learn more about our services and view our portfolio! 🌸✨`;
      const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: websiteResponse }];
      return { response: websiteResponse, draft: null, updatedHistory };
    }

    // Customer care/contact number query detection
    const customerCareKeywords = ['customer care', 'support', 'help line', 'call', 'phone number', 'contact number', 'telephone', 'mobile number', 'reach you'];
    if (customerCareKeywords.some((kw) => lower.includes(kw))) {
      const careResponse = `You can reach our customer care team at ${this.customerCarePhone}. We're here to help! 💖 You can also email us at ${this.customerCareEmail}.`;
      const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: careResponse }];
      return { response: careResponse, draft: null, updatedHistory };
    }

    // Business hours query detection
    const hoursQueryKeywords = ['hours', 'open', 'when are you open', 'operating hours', 'business hours', 'what time', 'opening hours', 'closing time', 'when do you close'];
    if (hoursQueryKeywords.some((kw) => lower.includes(kw))) {
      const hoursResponse = `We're open ${this.businessHours}. Feel free to visit us or book an appointment during these times! 🕐✨`;
      const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: hoursResponse }];
      return { response: hoursResponse, draft: null, updatedHistory };
    }

    // Comprehensive contact details query detection
    const contactDetailsKeywords = ['contact details', 'contact information', 'how to contact', 'get in touch', 'all contact', 'contact info'];
    if (contactDetailsKeywords.some((kw) => lower.includes(kw))) {
      const contactResponse = `Here are our complete contact details:\n\n` +
        `📍 *Location*: ${this.businessLocation.replace(' We look forward to welcoming you! 💖', '')}\n` +
        `📞 *Phone*: ${this.customerCarePhone}\n` +
        `📧 *Email*: ${this.customerCareEmail}\n` +
        `🌐 *Website*: ${this.businessWebsite}\n` +
        `🕐 *Hours*: ${this.businessHours}\n\n` +
        `We look forward to welcoming you! 💖`;
      const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: contactResponse }];
      return { response: contactResponse, draft: null, updatedHistory };
    }

    // --- DETECT ACKNOWLEDGMENTS/CONFIRMATIONS ---
    // Check if user is just acknowledging/confirming something from recent conversation
    // This prevents false booking intent triggers for simple acknowledgments
    const ackRecentAssistantMsgs = history
      .filter((msg) => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content.toLowerCase())
      .join(' ');
    
    const recentUserMsgs = history
      .filter((msg) => msg.role === 'user')
      .slice(-2)
      .map(msg => msg.content.toLowerCase())
      .join(' ');
    
    const acknowledgmentPatterns = [
      /^(ok|okay|sure|yes|yeah|yep|alright|sounds good|got it|understood|perfect|great|thanks|thank you)/i,
      /^(ok|okay|sure|yes|yeah|yep|alright|sounds good|got it|understood|perfect|great|thanks|thank you).*(then|i will|i'll)/i,
      /^(okay|ok|sure|yes|yeah|yep|alright).*then.*(i will|i'll)/i,
      /i will (come|bring|do)/i,
      /i'll (come|bring|do)/i,
      /that's (fine|good|okay|ok)/i,
      /(that|it) (sounds|is) (good|fine|okay|ok|great)/i,
    ];
    
    const isAcknowledgment = acknowledgmentPatterns.some(pattern => pattern.test(message)) &&
      !/(book|appointment|schedule|reserve|available|slot|date|time|when|what time|make a booking|new booking)/i.test(message);
    
    // Check if recent conversation was about FAQ/policy (photographer, bring, allowed, etc.)
    const recentWasFaq = /(welcome|fine|allowed|bring|include|can i|is it|are.*allowed|photographer|family|partner|guests|questions|feel free|anything else)/i.test(ackRecentAssistantMsgs) &&
      !/(book|appointment|schedule|reserve|available|slot|date|time|when|what time|make a booking|new booking)/i.test(ackRecentAssistantMsgs);
    
    // Also check if user's previous message was asking a question (FAQ context)
    const previousWasQuestion = /(can i|is it|are.*allowed|what|how|when|where|why|do you|does|photographer)/i.test(recentUserMsgs);
    
    if (isAcknowledgment && (recentWasFaq || previousWasQuestion) && !hasDraft) {
      // This is just an acknowledgment of an FAQ answer, not a booking request
      const acknowledgmentResponse = `Perfect! If you have any other questions or need help with anything else, feel free to ask. 😊`;
      return { 
        response: acknowledgmentResponse, 
        draft: null, 
        updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: acknowledgmentResponse }] 
      };
    }

    // --- STRATEGY PATTERN INTEGRATION ---
    // Strategies are now ordered by priority (FAQ -> Package -> Booking)
    // This ensures FAQ questions are handled first, even when there's a draft
    const context = {
      aiService: this,
      logger: this.logger,
      history,
      historyLimit: this.historyLimit,
      customerId,
      bookingsService,
      prisma: this.prisma,
      message,
      hasDraft,
      draft,
      enrichedContext
    };

    // Execute strategies in priority order (already sorted in constructor)
    for (const strategy of this.strategies) {
      if (strategy.canHandle(null, context)) {
        this.logger.debug(`[STRATEGY] ${strategy.constructor.name} handling message: "${message.substring(0, 50)}..."`);
        const result = await strategy.generateResponse(message, context);
        if (result) {
          // Always extract the string response for history and output
          let responseText = result;
          if (typeof result === 'object' && result !== null) {
            responseText = result.response;
            if (typeof responseText === 'object' && responseText !== null && 'text' in responseText) {
              responseText = responseText.text;
            }
          }
          // Check if response mentions handing to team/admin - create escalation
          const responseStr = typeof responseText === 'string' ? responseText : JSON.stringify(responseText);
          await this.checkAndEscalateIfHandoffMentioned(responseStr, customerId, message, history);

          return {
            ...result,
            response: responseText,
            updatedHistory: result.updatedHistory
              ? result.updatedHistory.map((msg: any) => ({
                ...msg,
                content: typeof msg.content === 'object' && msg.content !== null && 'text' in msg.content ? msg.content.text : msg.content
              }))
              : undefined
          };
        }
      }
    }
    // ------------------------------------
    // INTENT CLASSIFICATION (Using Advanced Intent Service)
    // ------------------------------------
    
    let intent: 'faq' | 'booking' | 'other' = 'other';
    const confidenceThreshold = 0.7; // Minimum confidence to proceed without clarification
    
    // Use advanced intent analysis if available (from handleConversation)
    if (intentAnalysis && intentAnalysis.primaryIntent) {
      const primaryIntent = intentAnalysis.primaryIntent;
      const confidence = intentAnalysis.confidence || 0.5;
      
      this.logger.debug(`[INTENT] Advanced analysis: ${primaryIntent} (confidence: ${confidence})`);
      
      // Handle low confidence - ask for clarification
      if (confidence < confidenceThreshold) {
        const clarifyingQuestion = this.generateClarifyingQuestion(intentAnalysis, message);
        if (clarifyingQuestion) {
          this.logger.log(`[INTENT] Low confidence (${confidence}), asking for clarification`);
          return {
            response: clarifyingQuestion,
            draft: draft || null,
            updatedHistory: [
              ...history.slice(-this.historyLimit),
              { role: 'user', content: message },
              { role: 'assistant', content: clarifyingQuestion }
            ]
          };
        }
      }
      
      // Map advanced intents to simple intents for routing
      if (primaryIntent === 'booking' || primaryIntent === 'reschedule' || primaryIntent === 'availability') {
        intent = 'booking';
      } else if (primaryIntent === 'faq' || primaryIntent === 'package_inquiry' || primaryIntent === 'price_inquiry') {
        intent = 'faq';
      } else if (primaryIntent === 'complaint' || primaryIntent === 'objection') {
        // Complaints and objections should be handled specially
        intent = 'other';
        // These will be handled by FAQ strategy which can escalate
      } else {
        intent = 'other';
      }
      
      // Handle multiple intents - acknowledge secondary intents
      if (intentAnalysis.secondaryIntents && intentAnalysis.secondaryIntents.length > 0) {
        this.logger.debug(`[INTENT] Secondary intents detected: ${intentAnalysis.secondaryIntents.join(', ')}`);
        // Note: Secondary intents can be handled after primary intent is resolved
      }
      
      // Special cases that override intent classification
      // Check for backdrop/image/portfolio requests FIRST (even if there's a draft)
      if (/(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message)) {
        intent = 'faq';
        this.logger.log('[INTENT] Override: FAQ (backdrop/image request)');
      }
      // Check for policy/FAQ questions even when there's a draft
      else if (hasDraft && /(can i (bring|have|include|add)|is it (okay|ok|allowed|fine)|are.*allowed|what (can|should) i (bring|wear|do)|can.*(family|partner|husband|spouse|children|kids|baby)|bring.*(family|partner|husband|spouse|children|kids|guests))/i.test(message)) {
        intent = 'faq';
        this.logger.log('[INTENT] Override: FAQ (policy question)');
      }
    } else {
      // Fallback to basic classification if advanced analysis not available
      this.logger.warn('[INTENT] Advanced intent analysis not available, using fallback');
      
      // Check for backdrop/image/portfolio requests FIRST
      if (/(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message)) {
        intent = 'faq';
      } 
      // Check for policy/FAQ questions even when there's a draft
      else if (hasDraft && /(can i (bring|have|include|add)|is it (okay|ok|allowed|fine)|are.*allowed|what (can|should) i (bring|wear|do)|can.*(family|partner|husband|spouse|children|kids|baby)|bring.*(family|partner|husband|spouse|children|kids|guests))/i.test(message)) {
        intent = 'faq';
      } else if (hasDraft) {
        intent = 'booking';
      } else {
        // Basic keyword-based fallback
        if (/(book|appointment|reserve|schedule|slot|available|tomorrow|next)/.test(lower)) {
          intent = 'booking';
        } else if (/\?/.test(message) || /(price|cost|how much|hours|open|service)/.test(lower)) {
          intent = 'faq';
        } else {
          intent = 'other';
        }
      }
    }

    // Cancel existing unpaid drafts when starting new booking
    if (intent === 'booking' && hasDraft) {
      try {
        await this.prisma.bookingDraft.deleteMany({ where: { customerId } });
        draft = null;
        hasDraft = false;
        this.logger.log(`[NEW BOOKING] Cancelled existing unpaid draft for customer ${customerId} when starting new booking`);
      } catch (error) {
        // Draft may have been deleted already, continue anyway
        this.logger.debug(`[NEW BOOKING] Draft already deleted or doesn't exist for customer ${customerId}`);
        draft = null;
        hasDraft = false;
      }
    }

    // Route flows for non-package queries (packages already handled above)
    if (intent === 'faq' || intent === 'other') {
      const reply = await this.answerFaq(message, history, undefined, customerId, enrichedContext);
      const replyText = typeof reply === 'object' && 'text' in reply ? reply.text : reply;
      return { response: reply, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: replyText as string }] };
    }

    // Booking flow (Delegated to BookingStrategy)
    const bookingStrategy = this.strategies.find(s => s instanceof BookingStrategy);
    if (bookingStrategy) {
      // Re-create context if needed, or use the one defined above if in scope.
      // Since we are in the same function scope, 'context' defined above is available?
      // No, 'context' was defined inside a block or I need to check scope.
      // I defined it with 'const context =' at top level of function? No, I inserted it at line 1489.
      // If I inserted it with 'const', it's block scoped if inside 'if' or just function scoped?
      // It was inserted at line 1489 which is inside processConversationLogic but NOT inside an 'if'.
      // So it should be available here.
      // But wait, I inserted it REPLACING the package query block.
      // The package query block was inside processConversationLogic.
      // So 'context' should be available.
      return bookingStrategy.generateResponse(message, { ...context, intent: 'booking' });
    }

    // --- FINAL FALLBACK: FAQ / GENERAL ---
    // If we reach here, treat as FAQ/General
    this.logger.log(`[INTENT] Defaulting to FAQ/General for message: "${message}"`);
    const faqResponse = await this.answerFaq(message, history, undefined, customerId);

    // Track metrics for FAQ
    await this.trackConversationMetrics(customerId, {
      intent: 'faq',
      duration: 0, // Would need start time tracking for accuracy
      messagesCount: history.length + 1,
      resolved: true
    });

    return { response: faqResponse, draft: hasDraft ? draft : null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: faqResponse }] };
  }

  // Legacy / helper methods
  async addKnowledge(question: string, answer: string, category: string = 'general') {
    // Always write to your DB first (so seeding still persists even if Pinecone fails)
    try {
      // Manual upsert because schema update might fail on hot reload
      const existing = await this.prisma.knowledgeBase.findFirst({
        where: { question },
      });

      if (existing) {
        // Update existing
        await this.prisma.knowledgeBase.update({
          where: { id: existing.id },
          data: {
            answer,
            category,
            // Re-generate embedding if needed
            embedding: await this.generateEmbedding(question + ' ' + answer),
          },
        });
      } else {
        // Create new
        await this.prisma.knowledgeBase.create({
          data: {
            question,
            answer,
            category,
            embedding: await this.generateEmbedding(question + ' ' + answer),
          },
        });
      }
    } catch (err) {
      this.logger.error(`addKnowledge: Failed to save to DB: ${err.message}`, err);
      return;
    }

    // If we have a valid Pinecone index, try to upsert as well.
    if (!this.index) {
      this.logger.debug('addKnowledge: Pinecone index not available, saved to DB only.');
      return;
    }

    try {
      await this.index.upsert([{
        id: `kb-${Date.now()}`,
        values: await this.generateEmbedding(question + ' ' + answer),
        metadata: { question, answer, category },
      }]);
      this.logger.log(`addKnowledge: added to Pinecone: ${question}`);
    } catch (err) {
      this.logger.warn('addKnowledge: failed to upsert to Pinecone (saved to DB only).', err);
    }
  }

  async processAiRequest(data: { question: string }) {
    const answer = await this.answerFaq(data.question, []);
    return answer;
  }

  async generateResponse(message: string, customerId: string, bookingsService: any, history?: any[], extractedBooking?: any, faqContext?: string): Promise<string> {
    const start = Date.now();
    let prediction = '';
    let error: string | undefined = undefined;
    let actual: string | undefined = undefined;
    let confidence: number | undefined = undefined;
    let modelVersion = extractModelVersion(this.chatModel);
    try {
      const result = await this.handleConversation(message, customerId, history || [], bookingsService);
      if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
        prediction = result.response.text;
      } else if (typeof result.response === 'string') {
        prediction = result.response;
      } else {
        prediction = '';
      }
      return prediction;
    } catch (err) {
      error = (err as Error)?.message || String(err);
      throw err;
    } finally {
      try {
        await this.prisma.aiPrediction.create({
          data: {
            input: message,
            prediction,
            actual,
            confidence,
            responseTime: Date.now() - start,
            error,
            userFeedback: null,
            modelVersion,
          },
        });
      } catch (logErr) {
        this.logger.warn('Failed to log AiPrediction', logErr);
      }
    }
  }

  async extractStepBasedBookingDetails(message: string, currentStep: string, history?: any[]): Promise<any> {
    return { nextStep: currentStep };
  }

  async generateStepBasedBookingResponse(message: string, customerId: string, bookingsService: any, history: any[] = [], draft: any, bookingResult: any): Promise<string> {
    const result = await this.handleConversation(message, customerId, history, bookingsService);
    if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
      return result.response.text;
    } else if (typeof result.response === 'string') {
      return result.response;
    }
    return '';
  }

  async generateGeneralResponse(message: string, customerId: string, bookingsService: any, history?: any[]): Promise<string> {
    const result = await this.handleConversation(message, customerId, history || [], bookingsService);
    if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
      return result.response.text;
    } else if (typeof result.response === 'string') {
      return result.response;
    }
    return '';
  }

  /* --------------------------
   * LEARNING AI - Enhanced Conversation Handler
   * -------------------------- */
  /**
   * @deprecated This method is deprecated. Learning is now integrated directly into handleConversation().
   * Use handleConversation() instead - it now includes all learning capabilities by default.
   * 
   * This method is kept for backward compatibility and simply calls handleConversation().
   */
  async handleConversationWithLearning(
    message: string,
    customerId: string,
    history: any[] = [],
    bookingsService?: any,
    retryCount = 0,
    enrichedContext?: any
  ): Promise<any> {
    this.logger.warn('[DEPRECATED] handleConversationWithLearning() is deprecated. Use handleConversation() instead - it now includes all learning capabilities.');
    // Simply delegate to handleConversation which now has all learning integrated
    return this.handleConversation(message, customerId, history, bookingsService, retryCount, enrichedContext);
  }

}
