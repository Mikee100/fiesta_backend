
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
import { ResponseStrategy } from './strategies/response-strategy.interface';

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
    if (pkg.description) {
      details += `\n${pkg.description}`;
    }
    if (includeFeatures && pkg.features && Array.isArray(pkg.features)) {
      details += `\nFeatures: ${pkg.features.join(', ')}`;
    }
    if (pkg.images && Array.isArray(pkg.images) && pkg.images.length > 0) {
      details += `\nImages: ${pkg.images.join(', ')}`;
    }
    return details;
  }



  // Models (override with env)
  private readonly embeddingModel: string;
  private readonly extractorModel: string;
  private readonly chatModel: string;

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
    @Inject(forwardRef(() => BookingsService)) @Optional() private bookingsService?: BookingsService,
    @Optional() private messagesService?: MessagesService,
    @Optional() private escalationService?: EscalationService,
    @InjectQueue('aiQueue') private aiQueue?: Queue,
    // Learning AI Services
    @Optional() private customerMemory?: CustomerMemoryService,
    @Optional() private conversationLearning?: ConversationLearningService,
    @Optional() private domainExpertise?: DomainExpertiseService,
    @Optional() private advancedIntent?: AdvancedIntentService,
    @Optional() private personalization?: PersonalizationService,
    @Optional() private feedbackLoop?: FeedbackLoopService,
    @Optional() private predictiveAnalytics?: PredictiveAnalyticsService,
  ) {
    // OpenAI client
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });

    // Models
    this.embeddingModel = this.configService.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    this.extractorModel = this.configService.get<string>('OPENAI_EXTRACTOR_MODEL', 'gpt-4o');
    this.chatModel = this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o');

    // Initialize Pinecone safely (doesn't throw if misconfigured)
    this.initPineconeSafely();

    this.strategies = [
      new PackageInquiryStrategy(),
      new BookingStrategy(),
    ];
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
   * Conversation Context Management
   * -------------------------- */
  private calculateTokenCount(messages: any[]): number {
    // Rough estimate: 1 token ≈ 4 characters
    return messages.reduce((acc, msg) =>
      acc + (msg.content?.length || 0) / 4, 0);
  }

  private pruneHistory(history: HistoryMsg[], maxTokens = 2000): HistoryMsg[] {
    let total = 0;
    const pruned: HistoryMsg[] = [];

    for (let i = history.length - 1; i >= 0; i--) {
      const tokens = history[i].content.length / 4;
      if (total + tokens > maxTokens) break;
      pruned.unshift(history[i]);
      total += tokens;
    }

    return pruned;
  }

  /* --------------------------
   * Fallback Mechanisms
   * -------------------------- */
  private async handleOpenAIFailure(error: any, customerId: string): Promise<string> {
    this.logger.error('OpenAI API failure', error);

    // Queue for retry
    if (this.aiQueue) {
      await this.aiQueue.add('retry-message', { customerId, error: error.message });
    }

    // Return graceful fallback
    if (error.code === 'insufficient_quota') {
      await this.escalationService?.createEscalation(
        customerId,
        'AI service quota exceeded'
      );
      return "I'm having technical difficulties. A team member will assist you shortly! 💖";
    }

    if (error.code === 'rate_limit_exceeded') {
      return "I'm receiving a lot of messages right now. Please give me a moment and try again! 💕";
    }

    return "I'm having trouble right now. Could you rephrase that, or would you like to speak with someone? 💕";
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
  private async checkBookingConflicts(customerId: string, dateTime: Date): Promise<{ conflict: string | null; suggestions?: string[] }> {
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        customerId,
        dateTime: {
          gte: new Date(),
        },
        status: { in: ['confirmed', 'pending'] },
      },
    });

    if (existingBookings.length > 0) {
      const existing = DateTime.fromJSDate(existingBookings[0].dateTime);
      const conflictMessage = `You already have a booking on ${existing.toFormat('MMM dd')}. Would you like to modify that instead?`;

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
    // keep this as-is (works for supported OpenAI SDKs)
    const r = await this.openai.embeddings.create({ model: this.embeddingModel, input: text });
    return r.data[0].embedding;
  }

  // Defensive wrapper for Pinecone query
  async retrieveRelevantDocs(query: string, topK = 3) {
    let docs: any[] = [];

    // 1. Try simple keyword/text search in DB first (Specific, high confidence)
    try {
      // Clean query for better matching
      const cleanQuery = query.replace(/[^\w\s]/gi, '').trim();
      if (cleanQuery.length > 3) {
      // Try exact match or highly similar match
        const dbMatches = await this.prisma.knowledgeBase.findMany({
          where: {
            AND: [
              {
                OR: [
                  { question: { equals: query, mode: 'insensitive' } },
                  { question: { contains: cleanQuery, mode: 'insensitive' } },
                ]
              },
              // Split query for basic keyword matching if long enough
              ...(cleanQuery.split(' ').length > 3 ? cleanQuery.split(' ').filter(w => w.length > 3).map(w => ({
                question: { contains: w, mode: 'insensitive' as any }
              })) : [])
            ]
          },
          take: 2 // Only take top direct matches
        });

        if (dbMatches.length > 0) {
          docs.push(...dbMatches.map(f => ({
            id: f.id,
            score: 0.95, // High scores for DB text matches
            metadata: {
              answer: f.answer,
              text: f.question,
              category: f.category,
              mediaUrls: [] // Add if your schema has it
            }
          })));
          this.logger.debug(`retrieveRelevantDocs: Found ${dbMatches.length} DB text matches`);
        }
      }
    } catch (err) {
      this.logger.warn('retrieveRelevantDocs: DB text search failed', err);
    }

    // 2. Try Pinecone Vector Search (Semantic, broader coverage)
    if (this.index) {
      try {
        const vec = await this.generateEmbedding(query);
        const resp = await this.index.query({ vector: vec, topK, includeMetadata: true });

        if (resp.matches) {
          // Add unique Pinecone matches (avoid duplicates if same ID found in DB)
          const existingIds = new Set(docs.map(d => d.id));
          const newMatches = resp.matches.filter(m => !existingIds.has(m.id));
          docs.push(...newMatches);
        }
      } catch (err) {
        this.logger.warn('retrieveRelevantDocs: Pinecone query failed', err);
      }
    }

    // Fallback: If no DB or Pinecone docs found, try fuzzy matching on all FAQs
    if (docs.length === 0) {
      this.logger.debug('retrieveRelevantDocs: No DB or Pinecone match - trying fuzzy FAQ match.');
      try {
        // Clean query for better matching (remove punctuation, lower case)
        const cleanQuery = query.replace(/[\p{P}$+<=>^`|~]/gu, '').toLowerCase().trim();
        if (cleanQuery.length > 3) {
          // Fetch all FAQs and do fuzzy matching in JS for flexibility
          const allFaqs = await this.prisma.knowledgeBase.findMany();
          // Use simple similarity scoring (word overlap)
          function similarity(a: string, b: string) {
            a = a.replace(/[\p{P}$+<=>^`|~]/gu, '').toLowerCase();
            b = b.replace(/[\p{P}$+<=>^`|~]/gu, '').toLowerCase();
            if (a === b) return 1;
            const aWords = new Set(a.split(' '));
            const bWords = new Set(b.split(' '));
            const intersection = new Set([...aWords].filter(x => bWords.has(x)));
            return intersection.size / Math.max(aWords.size, bWords.size);
          }
          const scored = allFaqs.map(f => ({
            ...f,
            sim: similarity(cleanQuery, f.question)
          })).sort((a, b) => b.sim - a.sim);
          // Only consider as match if similarity is above threshold
          const best = scored[0];
          if (best && best.sim > 0.5) {
            docs.push({
              id: best.id,
              score: best.sim,
              metadata: {
                answer: best.answer,
                text: best.question,
                category: best.category,
                mediaUrls: []
              }
            });
            this.logger.debug(`retrieveRelevantDocs: Fuzzy FAQ match found (sim=${best.sim.toFixed(2)}): "${best.question}"`);
          } else {
            this.logger.warn(`retrieveRelevantDocs: No FAQ match found for: "${query}". Closest: "${best?.question}" (sim=${best?.sim?.toFixed(2)})`);
          }
        }
      } catch (err) {
        this.logger.warn('retrieveRelevantDocs: Fuzzy FAQ match failed', err);
      }
    }

    // Sort by score/confidence
    return docs.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, topK);
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
        this.logger.warn(`[AiService] No FAQ match found in DB for question: "${question}". Falling back to LLM.`);
        // Fallback to LLM, but remind AI to use FAQ answers if available
        const messages: any[] = [
          {
            role: 'system',
            content:
              `You are a warm, empathetic AI assistant for a maternity photoshoot studio. Always answer with genuine care and conversational intelligence.

IMPORTANT: Before generating any answer, ALWAYS check the database FAQs provided in context. If a relevant FAQ is found, use its answer directly and do NOT invent or hallucinate. Only generate a new answer if no FAQ matches.

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

        // Keep OpenAI call compatible with the version you're using, with fallback handling
        try {
          const rsp = await this.openai.chat.completions.create({
            model: this.chatModel,
            messages,
            max_tokens: 280, // Increased for more conversational responses
            temperature: 0.6, // Increased for more natural tone while staying accurate
          });
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
  async extractBookingDetails(message: string, history: HistoryMsg[] = []): Promise<{
    service?: string; date?: string; time?: string; name?: string; recipientName?: string; recipientPhone?: string; isForSomeoneElse?: boolean; subIntent: 'start' | 'provide' | 'confirm' | 'cancel' | 'unknown';
  }> {
    const currentDate = DateTime.now().setZone(this.studioTz).toFormat('yyyy-MM-dd');
    const currentDayOfMonth = DateTime.now().setZone(this.studioTz).day;
    const currentMonth = DateTime.now().setZone(this.studioTz).toFormat('MMMM');

    const systemPrompt = `You are a precise JSON extractor for maternity photoshoot bookings.
Return ONLY valid JSON (no commentary, no explanation). Schema:

{
  "service": string | null,
  "date": string | null,
  "time": string | null,
  "name": string | null,
  "recipientPhone": string | null,
  "subIntent": "start" | "provide" | "confirm" | "cancel" | "reschedule" | "unknown"
}

CONTEXT:
Current Date: ${currentDate} (Today is day ${currentDayOfMonth} of ${currentMonth})
Timezone: Africa/Nairobi (EAT)

EXTRACTION RULES:
1. Extract ONLY what is explicitly present in the CURRENT message
2. If user mentions a change/correction to a previous value, extract the NEW value
3. Use null for anything not mentioned or unclear
4. Do NOT include extra fields or prose
5. Do NOT invent values

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
- confirm: Short confirmations ("yes", "confirm", "that's right", "sounds good")
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
      const rsp = await this.openai.chat.completions.create({
        model: this.extractorModel,
        messages,
        max_tokens: 200, // Increased for better reasoning
        temperature: 0.1,
      });

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

      const extraction = {
        service: typeof parsed.service === 'string' ? parsed.service : undefined,
        date: typeof parsed.date === 'string' ? parsed.date : undefined,
        time: typeof parsed.time === 'string' ? parsed.time : undefined,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        recipientPhone: typeof parsed.recipientPhone === 'string' ? parsed.recipientPhone : undefined,
        subIntent: ['start', 'provide', 'confirm', 'cancel', 'reschedule', 'unknown'].includes(parsed.subIntent) ? parsed.subIntent : 'unknown',
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
    const missing = [];
    if (!draft.service) missing.push('service');
    if (!draft.date) missing.push('date');
    if (!draft.time) missing.push('time');
    if (!draft.name) missing.push('name');
    if (!draft.recipientPhone) missing.push('recipientPhone');

    // Default recipientName to name for all bookings
    if (!draft.recipientName && draft.name) {
      draft.recipientName = draft.name;
    }

    const nextStep = missing.length === 0 ? 'confirm' : missing[0];
    const isUpdate = extraction.service || extraction.date || extraction.time || extraction.name || extraction.recipientName || extraction.recipientPhone;

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
  
  Next info needed: ${nextStep}
  User just updated something: ${isUpdate}

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
      const rsp = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        max_tokens: 280, // Increased slightly for richer responses
        temperature: 0.75, // Slightly higher for more natural conversation
      });
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

  async mergeIntoDraft(customerId: string, extraction: any) {
    const existingDraft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    const updates: any = {};
    if (extraction.service) updates.service = extraction.service;
    if (extraction.date) updates.date = extraction.date;
    if (extraction.time) updates.time = extraction.time;
    if (extraction.name) updates.name = extraction.name;

    if (extraction.recipientPhone) {
      if (this.validatePhoneNumber(extraction.recipientPhone)) {
        updates.recipientPhone = extraction.recipientPhone;
      } else {
        this.logger.warn(`Invalid phone number provided: ${extraction.recipientPhone}`);
        // Optionally, we could return an error or handle this differently, 
        // but for now we just won't update the draft with the invalid phone
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

    const updated = await this.prisma.bookingDraft.upsert({
      where: { customerId },
      update: {
        ...updates,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        customerId,
        step: 'service',
        version: 1,
        ...updates,
      },
    });
    return updated;
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
      if (extraction.subIntent === 'deposit_confirmed' || (typeof extraction.content === 'string' && extraction.content.trim().toLowerCase() === 'confirm')) {
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
    try {
      return await this.processConversationLogic(message, customerId, history, bookingsService, enrichedContext);
    } catch (err) {
      return this.attemptRecovery(err, { message, customerId, history, bookingsService, retryCount });
    }
  }

  private async attemptRecovery(error: any, context: any): Promise<any> {
    if (context.retryCount > 1) {
      this.logger.error('Max retries exceeded in attemptRecovery', error);
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

    // Rethrow other errors to be handled by caller or global filter
    throw error;
  }

  /* --------------------------
   * Core conversation logic
   * -------------------------- */
  private async processConversationLogic(message: string, customerId: string, history: HistoryMsg[] = [], bookingsService?: any, enrichedContext?: any) {
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

    let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
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
    // Also catch direct patterns like "available (hours|times|slots) (on|for|tomorrow|today)"
    const slotIntentRegex = /(available|free|open)\s+(hours|times|slots)(\s+(on|for|tomorrow|today|\d{4}-\d{2}-\d{2}))?/i;
    const slotIntentDetected = slotIntent || slotIntentRegex.test(message);

    if (slotIntentDetected) {
      // Try to extract date (e.g., 'tomorrow', 'on 2025-11-20', etc.)
      let dateStr: string | undefined;
      if (/tomorrow/.test(lower)) {
        dateStr = DateTime.now().setZone(this.studioTz).plus({ days: 1 }).toFormat('yyyy-MM-dd');
      } else {
        // Try to extract explicit date
        const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) dateStr = dateMatch[1];
      }

      // Try to get package/service from draft or message
      let service: string | undefined = draft?.service;
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

    // 3. ENHANCED CANCELLATION DETECTION (moved before booking flow to catch cancel intent early)
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
      /(change|move|modify).*(booking|appointment|date|time)/i.test(message);

    if (isRescheduleIntent || (draft && draft.step === 'reschedule')) {
      this.logger.log(`[RESCHEDULE] Detected intent or active flow for customer ${customerId}`);

      // If this is a new request (not yet in reschedule step), setup the draft
      if (!draft || draft.step !== 'reschedule') {
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

        // SMART: Try to parse which booking they're referring to from the message
        // e.g., "reschedule the one on 6th Dec" or "move my Dec 6th appointment"
        const dateMatch = message.match(/(\d{1,2})(st|nd|rd|th)?\s*(dec|december|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november)/i);

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
        }

        // If user has multiple bookings and didn't specify which one, ask them
        if (allBookings.length > 1 && !dateMatch) {
          const bookingsList = allBookings.map((b, idx) => {
            const dt = DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
            return `${idx + 1}️⃣ ${b.service} on ${dt.toFormat('MMM dd, yyyy')} at ${dt.toFormat('h:mm a')}`;
          }).join('\n');

          const msg = `You have ${allBookings.length} upcoming bookings:\n\n${bookingsList}\n\nWhich one would you like to reschedule? Just tell me the date (e.g., "the one on Dec 6th") 🗓️`;
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

    // 4. DETECT "NEW BOOKING" INTENT WITH EXISTING BOOKING
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
          const hasChoice = /(cancel|delete).*(existing|old|that)/i.test(message) ||
            /(modify|reschedule|change).*(existing|it)/i.test(message) ||
            /(different|another).*(date|time)/i.test(message);

          if (hasChoice) {
            // Extract which option they chose
            if (/(cancel|delete).*(existing|old|that|booking)/i.test(message)) {
              // Set the choice and cancel the booking
              if (draft) {
                await this.prisma.bookingDraft.update({
                  where: { customerId },
                  data: { conflictResolution: 'cancel_existing' }
                });
              } else {
                draft = await this.prisma.bookingDraft.create({
                  data: { customerId, step: 'service', conflictResolution: 'cancel_existing' }
                });
              }

              await this.bookingsService.cancelBooking(existingBooking.id);
              const msg = "Done! I've cancelled your previous booking. Now let's create your new one! What package would you like? 💖";
              return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            } else if (/(modify|reschedule|change)/i.test(message)) {
              // Redirect to reschedule
              draft = await this.prisma.bookingDraft.upsert({
                where: { customerId },
                update: { step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
                create: { customerId, step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
              });
              const msg = "Perfect! When would you like to reschedule your appointment to? 🗓️";
              return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            } else {
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
    if (draft && draft.step === 'reschedule') {
      this.logger.log(`[RESCHEDULE] Continuing reschedule flow for customer ${customerId}`);

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

          // 1. Check for conflicts first
          const conflictResult = await this.checkBookingConflicts(customerId, newDateObj);
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

    // CHECK FOR PACKAGE QUERIES FIRST (before intent classification)
    // BUT exclude backdrop/image requests which should go to FAQ flow
    const isBackdropImageRequest = /(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message);
    const isPackageQuery = !isBackdropImageRequest && /(package|price|pricing|cost|how much|offer|photoshoot|shoot|what do you have|what are|show me|tell me about)/i.test(message);

    if (isBackdropImageRequest) {
      this.logger.log(`[BACKDROP REQUEST DETECTED] Message: "${message}" - routing to FAQ flow`);
    }

    // --- STRATEGY PATTERN INTEGRATION ---
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
      draft
    };

    for (const strategy of this.strategies) {
      if (strategy.canHandle(null, context)) {
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

    let intent: 'faq' | 'booking' | 'other' = 'other';

    // Check for backdrop/image/portfolio requests FIRST (even if there's a draft)
    // These should always go to FAQ flow, not booking
    if (/(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message)) {
      intent = 'faq';
      this.logger.log('[INTENT] Classified as FAQ (backdrop/image request) - overriding draft check');
    } else if (hasDraft) {
      intent = 'booking';
    } else {
      if (/(book|appointment|reserve|schedule|slot|available|tomorrow|next)/.test(lower)) {
        intent = 'booking';
      } else if (/\?/.test(message) || /(price|cost|how much|hours|open|service)/.test(lower)) {
        intent = 'faq';
      } else {
        try {
          const classifierMsg: any[] = [
            { role: 'system', content: 'Classify the user intent as "faq", "booking", or "other". Return JSON only: { "intent": "<label>" }' },
            ...history.slice(-3).map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
          ];
          const cresp = await this.openai.chat.completions.create({ model: this.chatModel, messages: classifierMsg, max_tokens: 16, temperature: 0.0 });
          const cret = cresp.choices[0].message.content;
          const m = cret.match(/"(faq|booking|other)"/) || cret.match(/\{\s*"intent"\s*:\s*"(faq|booking|other)"\s*\}/);
          if (m) intent = (m[1] as 'faq' | 'booking' | 'other');
        } catch (e) {
          this.logger.warn('intent classifier fallback failed', e);
        }
      }
    }

    // Cancel existing unpaid drafts when starting new booking
    if (intent === 'booking' && hasDraft) {
      await this.prisma.bookingDraft.delete({ where: { customerId } });
      draft = null;
      hasDraft = false;
      this.logger.log(`[NEW BOOKING] Cancelled existing unpaid draft for customer ${customerId} when starting new booking`);
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
   * Enhanced conversation handler with full learning AI capabilities
   * 
   * This wraps the existing handleConversation with:
   * - Customer memory and personalization
   * - Advanced intent analysis  
   * - Conversation learning and feedback
   * - Automatic improvement
   */
  async handleConversationWithLearning(
    message: string,
    customerId: string,
    history: any[] = [],
    bookingsService?: any,
    retryCount = 0,
    enrichedContext?: any
  ): Promise<any> {
    const conversationStartTime = Date.now();
    let personalizationContext: any = null;
    let intentAnalysis: any = null;
    let wasSuccessful = false;
    let conversationOutcome = 'unknown';

    try {
      // STEP 1: Load customer memory & context
      if (this.customerMemory) {
        try {
          personalizationContext = await this.customerMemory.getPersonalizationContext(customerId);
          this.logger.debug(`[LEARNING] Context: ${personalizationContext.relationshipStage}, VIP: ${personalizationContext.isVIP}`);
          enrichedContext = { ...enrichedContext, personalization: personalizationContext };
        } catch (err) {
          this.logger.warn('[LEARNING] Failed to load context', err);
        }
      }

      // STEP 2: Advanced intent analysis
      if (this.advancedIntent) {
        try {
          intentAnalysis = await this.advancedIntent.analyzeIntent(message, personalizationContext);
          this.logger.debug(`[LEARNING] Intent: ${intentAnalysis.primaryIntent} (${intentAnalysis.confidence}), Tone: ${intentAnalysis.emotionalTone}`);

          if (intentAnalysis.requiresHumanHandoff && this.escalationService) {
            await this.escalationService.createEscalation(customerId, 'AI detected need for human', 'auto_detected', { intentAnalysis, message });
          }
        } catch (err) {
          this.logger.warn('[LEARNING] Intent analysis failed', err);
        }
      }

      // STEP 3: Generate personalized greeting (first message)
      if (history.length === 0 && this.personalization && personalizationContext) {
        try {
          const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
          const greeting = await this.personalization.generateGreeting(customerId, customer?.name);
          history = [{ role: 'assistant', content: greeting }];
        } catch (err) {
          this.logger.warn('[LEARNING] Greeting failed', err);
        }
      }

      // STEP 4: Call original handler
      const result = await this.handleConversation(message, customerId, history, bookingsService, retryCount, enrichedContext);

      // STEP 5: Personalize response
      if (result.response && this.personalization && personalizationContext) {
        try {
          result.response = this.personalization.adaptResponse(result.response, personalizationContext.communicationStyle || 'friendly');

          if (intentAnalysis?.emotionalTone) {
            result.response = this.personalization.matchEmotionalTone(result.response, intentAnalysis.emotionalTone);
          }

          if (intentAnalysis?.primaryIntent) {
            const suggestions = await this.personalization.generateProactiveSuggestions(customerId, intentAnalysis.primaryIntent);
            if (suggestions.length > 0 && Math.random() > 0.7) {
              result.response += `\n\n💡 ${suggestions[0]}`;
            }
          }
        } catch (err) {
          this.logger.warn('[LEARNING] Personalization failed', err);
        }
      }

      // Determine success & outcome
      wasSuccessful = !result.response?.includes('trouble') && !result.response?.includes('error');
      if (result.draft && result.draft.step === 'confirm') conversationOutcome = 'booking_initiated';
      else if (intentAnalysis?.primaryIntent === 'booking') conversationOutcome = 'booking_in_progress';
      else if (intentAnalysis?.primaryIntent === 'package_inquiry') conversationOutcome = 'information_provided';
      else conversationOutcome = 'resolved';

      // STEP 6: Record learning
      if (this.conversationLearning) {
        try {
          await this.conversationLearning.recordLearning(customerId, {
            userMessage: message,
            aiResponse: result.response || '',
            extractedIntent: intentAnalysis?.primaryIntent || 'unknown',
            emotionalTone: intentAnalysis?.emotionalTone,
            wasSuccessful,
            conversationOutcome,
            conversationLength: history.length + 1,
            timeToResolution: Math.floor((Date.now() - conversationStartTime) / 1000),
          });
        } catch (err) {
          this.logger.warn('[LEARNING] Failed to record', err);
        }
      }

      // STEP 7: Update customer memory
      if (this.customerMemory && this.personalization) {
        try {
          const preferences = this.personalization.extractPreferencesFromMessage(message);
          if (Object.keys(preferences).length > 0) {
            await this.customerMemory.updatePreferences(customerId, preferences);
          }

          if (conversationOutcome === 'booking_initiated' && personalizationContext.relationshipStage === 'new') {
            await this.customerMemory.updateRelationshipStage(customerId, 'booked');
          } else if (conversationOutcome === 'information_provided' && personalizationContext.relationshipStage === 'new') {
            await this.customerMemory.updateRelationshipStage(customerId, 'interested');
          }

          await this.customerMemory.addConversationSummary(customerId, {
            date: new Date(),
            intent: intentAnalysis?.primaryIntent || 'unknown',
            outcome: conversationOutcome,
            keyPoints: [message.substring(0, 100)],
          });

          if (history.length >= 3) {
            const userMessages = history.filter((h: any) => h.role === 'user').map((h: any) => h.content);
            const detectedStyle = this.customerMemory.detectCommunicationStyle(userMessages);
            await this.customerMemory.updatePreferences(customerId, { communicationStyle: detectedStyle });
          }
        } catch (err) {
          this.logger.warn('[LEARNING] Memory update failed', err);
        }
      }

      return result;
    } catch (error) {
      if (this.conversationLearning) {
        try {
          await this.conversationLearning.recordLearning(customerId, {
            userMessage: message,
            aiResponse: error.message || 'Error',
            extractedIntent: intentAnalysis?.primaryIntent || 'unknown',
            emotionalTone: intentAnalysis?.emotionalTone,
            wasSuccessful: false,
            conversationOutcome: 'error',
            conversationLength: history.length + 1,
          });
        } catch (err) {
          this.logger.warn('[LEARNING] Error recording failed', err);
        }
      }
      throw error;
    }
  }

}
