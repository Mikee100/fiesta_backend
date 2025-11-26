// src/modules/ai/ai.service.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PrismaService } from '../../prisma/prisma.service';
// Utility to extract model version from OpenAI model string
function extractModelVersion(model: string): string {
  if (!model) return '';
  const match = model.match(/(gpt-[^\s]+)/);
  return match ? match[1] : model;
}
import { BookingsService } from '../bookings/bookings.service';
import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';

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
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private pinecone: Pinecone | null = null;
  private index: any = null;

  // Models (override with env)
  private readonly embeddingModel: string;
  private readonly extractorModel: string;
  private readonly chatModel: string;

  // Studio timezone
  private readonly studioTz = 'Africa/Nairobi';
  // How many history turns to send to the model
  private readonly historyLimit = 6;

  // Fixed business name and location string for responses
  private readonly businessName = 'Fiesta House Attire maternity photoshoot studio';
  private readonly businessLocation = 'Our studio is located at 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor. We look forward to welcoming you! 💖';

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => BookingsService)) private bookingsService: BookingsService,
    @InjectQueue('aiQueue') private aiQueue: Queue,
  ) {
    // OpenAI client
    this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') });

    // Models
    this.embeddingModel = this.configService.get<string>('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    this.extractorModel = this.configService.get<string>('OPENAI_EXTRACTOR_MODEL', 'gpt-4o');
    this.chatModel = this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o');

    // Initialize Pinecone safely (doesn't throw if misconfigured)
    this.initPineconeSafely();
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
   * Helper: normalize date/time using chrono + luxon
   * Returns null or { isoUtc, dateOnly, timeOnly }
   * More robust handling + logging for ambiguous dates.
   * -------------------------- */
  private normalizeDateTime(rawDate?: string | null, rawTime?: string | null) {
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
    if (!this.index) {
      this.logger.debug('retrieveRelevantDocs: Pinecone index not available - returning empty result (DB-only).');
      return [];
    }
    try {
      const vec = await this.generateEmbedding(query);
      const resp = await this.index.query({ vector: vec, topK, includeMetadata: true });
      return resp.matches ?? [];
    } catch (err) {
      this.logger.warn('retrieveRelevantDocs: Pinecone query failed', err);
      return [];
    }
  }

  async answerFaq(question: string, history: HistoryMsg[] = [], actual?: string, customerId?: string) {
    let prediction = '';
    let confidence: number | undefined = undefined;
    let error: string | undefined = undefined;
    const start = Date.now();
    try {
      const docs = await this.retrieveRelevantDocs(question, 3);
      if (docs.length > 0) {
        prediction = docs[0].metadata.answer;
        confidence = docs[0].score;
        return prediction;
      }
      // If no relevant docs found, generate a general response
      const messages: any[] = [
        {
          role: 'system',
          content:
            `You are a loving, emotionally intelligent assistant for a maternity photoshoot studio. Your clients are expectant mothers and their families, who may ask about anything—studio services, life, pregnancy, or even unrelated topics. Always answer with warmth, flexibility, and genuine care. Use sweet, supportive, and human language. If you don't know something, respond with kindness and offer to help or find out. Never sound like a bot—be a resourceful, creative, and emotionally present friend who can help with any question or need. If the user asks for business details, provide them clearly and warmly.

IMPORTANT: You MUST base your answer STRICTLY on the provided Context messages below. Do NOT invent, hallucinate, or add any information not explicitly stated in the contexts. If contexts describe packages, services, prices, or details, list and describe them EXACTLY as written—do not create new names, prices, or features. If no relevant context, say you need to check or offer general support.`,
        },
      ];

      // Add the top doc contexts as separate system messages (keeps structure clear)
      docs.forEach((d: any, i: number) => {
        const md = d.metadata ?? {};
        messages.push({ role: 'system', content: `Context ${i + 1}: ${md.answer ?? md.text ?? ''}` });
      });

      // Only send the last N turns
      messages.push(...history.slice(-this.historyLimit).map(h => ({ role: h.role, content: h.content })));
      messages.push({ role: 'user', content: question });

      // Keep OpenAI call compatible with the version you're using
      const rsp = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        max_tokens: 220,
        temperature: 0.0,
      });
      prediction = rsp.choices[0].message.content.trim();
      // OpenAI doesn't provide confidence, so leave as undefined
      return prediction;
    } catch (err) {
      this.logger.error('answerFaq error', err);
      error = (err as Error)?.message || String(err);
      prediction = "I'm not sure about that but I can check for you.";
      return prediction;
    } finally {
      // Log to AiPrediction if customerId is provided
      if (customerId) {
        try {
          await this.prisma.aiPrediction.create({
            data: {
              input: question,
              prediction,
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
    const systemPrompt = `You are a strict JSON extractor for maternity photoshoot bookings.
Return ONLY valid JSON (no commentary). Schema:

{
  "service": string | null,
  "date": string | null,
  "time": string | null,
  "name": string | null,
  "recipientName": string | null,
  "recipientPhone": string | null,
  "isForSomeoneElse": boolean | null,
  "subIntent": "start" | "provide" | "confirm" | "cancel" | "unknown"
}

Rules:
- Extract ONLY what is explicitly present in the CURRENT message.
- If the user mentions a change to a previously provided value (date, time, service, name, recipientName, recipientPhone), return it explicitly in JSON.
- Do NOT invent or assume values; use null when unknown.
- Do NOT include extra fields or prose.
- Use history for context on prior values, but extract only from the current message.
- Set "isForSomeoneElse" to true if the message indicates the booking is for someone else (e.g., "for my wife", "my friend", "someone else", "not for me").
- Extract "recipientName" if mentioned as the person the booking is for.
- Extract "recipientPhone" if a phone number is provided for the recipient.
Examples:
- "I'd like a haircut tomorrow at 9am" => service: "haircut", date: "tomorrow", time: "9am", name: null, recipientName: null, recipientPhone: null, isForSomeoneElse: null, subIntent: "start".
- "Change my time to 3pm" => time: "3pm", recipientName: null, recipientPhone: null, isForSomeoneElse: null, subIntent: "provide".
- "Book for my sister Jane at 0712345678" => service: null, date: null, time: null, name: null, recipientName: "Jane", recipientPhone: "0712345678", isForSomeoneElse: true, subIntent: "start".
- Short confirmations like "yes" or "confirm" => subIntent: "confirm".
`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    messages.push(...history.slice(-this.historyLimit).map(h => ({ role: h.role, content: h.content })));
    messages.push({ role: 'user', content: message });

    try {
      const rsp = await this.openai.chat.completions.create({
        model: this.extractorModel,
        messages,
        max_tokens: 160,
        temperature: 0.1,
      });

      let content = rsp.choices[0].message.content?.trim() ?? '';
      // Try to extract JSON — allow fenced content or raw object
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const objMatch = content.match(/\{[\s\S]*\}/);
      const jsonText = fenced ? fenced[1] : (objMatch ? objMatch[0] : content);
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseErr) {
        this.logger.warn('extractBookingDetails JSON parse failed, raw model output:', content, parseErr);
        return { subIntent: 'unknown' };
      }

      return {
        service: typeof parsed.service === 'string' ? parsed.service : undefined,
        date: typeof parsed.date === 'string' ? parsed.date : undefined,
        time: typeof parsed.time === 'string' ? parsed.time : undefined,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        recipientName: typeof parsed.recipientName === 'string' ? parsed.recipientName : undefined,
        recipientPhone: typeof parsed.recipientPhone === 'string' ? parsed.recipientPhone : undefined,
        isForSomeoneElse: typeof parsed.isForSomeoneElse === 'boolean' ? parsed.isForSomeoneElse : undefined,
        subIntent: ['start', 'provide', 'confirm', 'cancel', 'unknown'].includes(parsed.subIntent) ? parsed.subIntent : 'unknown',
      };
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
    if (draft.isForSomeoneElse) {
      if (!draft.recipientName) missing.push('recipientName');
      if (!draft.recipientPhone) missing.push('recipientPhone');
    } else {
      // For self-booking, recipientName and recipientPhone are optional but confirm phone
      if (!draft.recipientName) draft.recipientName = draft.name;
      if (!draft.recipientPhone) missing.push('recipientPhone');
    }

    const nextStep = missing.length === 0 ? 'confirm' : missing[0];
    const isUpdate = extraction.service || extraction.date || extraction.time || extraction.name || extraction.recipientName || extraction.recipientPhone;

    let packagesInfo = '';
    if (nextStep === 'service') {
      try {
        const packages = await this.bookingsService.getPackages();
        packagesInfo = `Available packages: ${packages.map((p: any) => `${p.name} (${p.duration}, KSH ${p.price})`).join('; ')}.`;
      } catch (err) {
        this.logger.warn('Failed to fetch packages for reply', err);
      }
    }

    const sys = `You are a loving, emotionally intelligent assistant for a maternity photoshoot studio.
  Your clients are expectant mothers and their families—often feeling emotional, excited, and sometimes anxious.

  Instructions:
  - Always use sweet, gentle, and supportive language.
  - Celebrate their journey ("What a magical time!" or "You’re glowing!").
  - If asking for details, do it softly and with encouragement.
  - If confirming, use warm, celebratory language.
  - If the user updates something, acknowledge it kindly.
  - Never sound robotic or like a bot—always sound like a caring friend.
  - Stress getting the name early by making it a priority if missing.
  - For bookings for someone else, collect recipient name and phone, then confirm if the phone is the best to reach them.
  - For self-bookings, set recipient to customer details, but ask to confirm if the WhatsApp number is the best to reach them.

  CURRENT DRAFT:
  Package: ${draft.service ?? 'missing'}
  Date: ${draft.date ?? 'missing'}
  Time: ${draft.time ?? 'missing'}
  Name: ${draft.name ?? 'missing'}
  Is for someone else: ${draft.isForSomeoneElse ?? false}
  Recipient Name: ${draft.recipientName ?? 'missing'}
  Recipient Phone: ${draft.recipientPhone ?? 'missing'}
  Next step: ${nextStep}
  Is update? ${isUpdate}
  ${packagesInfo}

  USER MESSAGE: ${message}
  EXTRACTION: ${JSON.stringify(extraction)}

  Special logic:
  - If isForSomeoneElse is true, require recipientName and recipientPhone.
  - If recipientPhone is missing, ask if the WhatsApp number is the best to reach them; if not, request the correct number.
  - If recipientName is missing and isForSomeoneElse, gently ask for the name.
  - If all details are present, confirm warmly and summarize including recipient info (e.g., "for [recipientName]").
  - For self-bookings, recipientName = name, and confirm phone reachability.
  - Never proceed to confirmation until required fields are filled.`;

    const messages: any[] = [{ role: 'system', content: sys }];
    messages.push(...history.slice(-this.historyLimit).map(h => ({ role: h.role, content: h.content })));
    messages.push({ role: 'user', content: message });

    try {
      const rsp = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        max_tokens: 220,
        temperature: 0.7,
      });
      const reply = rsp.choices[0].message.content?.trim() ?? "How can I help with your booking?";
      return reply;
    } catch (err) {
      this.logger.error('generateBookingReply error', err);
      return "Sorry — I had trouble composing a reply. Can you confirm the details?";
    }
  }

  /* --------------------------
   * Booking flow helpers (unchanged but robust)
   * -------------------------- */
  async getOrCreateDraft(customerId: string) {
    let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    if (!draft) {
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
    if (extraction.recipientName) updates.recipientName = extraction.recipientName;
    if (extraction.recipientPhone) updates.recipientPhone = extraction.recipientPhone;
    if (extraction.isForSomeoneElse !== undefined) updates.isForSomeoneElse = extraction.isForSomeoneElse;

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

    // Handle recipient fields based on isForSomeoneElse
    if (draft.isForSomeoneElse) {
      if (!draft.recipientName) missing.push('recipientName');
      if (!draft.recipientPhone) missing.push('recipientPhone');
    } else {
      // For self-booking, default recipientName to name if missing
      if (!draft.recipientName) {
        draft.recipientName = draft.name; // Default for self-booking
        this.logger.debug(`Defaulted recipientName to name for self-booking: ${draft.recipientName}`);
        // Persist the defaulted recipientName to the draft in DB
        await this.mergeIntoDraft(customerId, { recipientName: draft.name });
      }
      // recipientPhone is optional for self-booking (assume WhatsApp number), but log if missing
      if (!draft.recipientPhone) {
        this.logger.debug('recipientPhone missing for self-booking; assuming WhatsApp number is sufficient.');
      }
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

      const avail = await bookingsService.checkAvailability(dateObj, draft.service);
      this.logger.debug('Availability check result:', { available: avail.available, suggestions: avail.suggestions?.length || 0 });

      if (!avail.available) {
        this.logger.warn('Requested slot not available during checkAndCompleteIfConfirmed:', dateObj.toISOString());
        return { action: 'unavailable', suggestions: avail.suggestions || [] };
      }

      try {
        this.logger.debug('Attempting to initiate deposit for booking draft for customerId:', customerId);
        const result = await bookingsService.completeBookingDraft(customerId, dateObj);
        this.logger.debug('Deposit initiated successfully:', JSON.stringify(result, null, 2));
        return { action: 'deposit_initiated', message: result.message, checkoutRequestId: result.checkoutRequestId };
      } catch (err) {
        this.logger.error('Deposit initiation failed in checkAndCompleteIfConfirmed', err);
        return { action: 'failed', error: 'There was an issue initiating payment. Please try again or contact support.' };
      }
    } else {
      this.logger.warn('Booking draft incomplete; missing fields:', missing);
      // Block confirmation message if required fields are missing
      return { action: 'incomplete', missing };
    }
  }

  /* --------------------------
   * High-level conversation handler
   * -------------------------- */
  async handleConversation(message: string, customerId: string, history: HistoryMsg[] = [], bookingsService?: any) {
    let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
    const hasDraft = !!draft;

    const lower = (message || '').toLowerCase();


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

    let intent: 'faq' | 'booking' | 'other' = 'other';
    if (hasDraft) {
      intent = 'booking';
    } else {
      if (/(book|appointment|reserve|schedule|slot|available|tomorrow|next)/.test(lower)) intent = 'booking';
      else if (/\?/.test(message) || /(price|cost|how much|hours|open|service)/.test(lower)) intent = 'faq';
      else {
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

    // Check if message mentions package-related keywords to prevent hallucination (only for non-booking intents)
    if (intent !== 'booking' && /(package|price|cost|how much|offer|studio|outdoor)/.test(lower)) {
      try {
        this.logger.log('Fetching packages from DB for package-related query');
        const allPackages = await this.bookingsService.getPackages();
        if (allPackages && allPackages.length > 0) {
          let packages = allPackages;
          let packageType = '';
          if (/(outdoor)/.test(lower)) {
            packages = allPackages.filter((p: any) => p.type?.toLowerCase() === 'outdoor');
            packageType = 'outdoor ';
          } else if (/(studio)/.test(lower)) {
            packages = allPackages.filter((p: any) => p.type?.toLowerCase() === 'studio');
            packageType = 'studio ';
          }
          if (packages.length > 0) {
            const packagesList = packages.map((p: any) => {
              // Defensive fallback for missing fields
              const name = p.name ?? 'Unnamed package';
              const dur = p.duration ?? 'unknown duration';
              let price = 'price not available';
              if (p.price !== undefined && p.price !== null) {
                price = `KSH ${p.price}`;
              }
              return `${name}: ${dur}, ${price}`;
            }).join('; ');
            const response = `Oh, my dear, I'm so delighted to share more about our ${packageType}packages with you! Each one is thoughtfully crafted to beautifully capture this precious time in your life. Here they are: ${packagesList}. If you have any questions about any package, just let me know! 💖`;
            return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
          } else {
            const response = `I'm not sure about our current ${packageType}packages. Would you like me to check and get back to you?`;
            return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
          }
        } else {
          this.logger.warn('No packages found in DB');
          const response = "I'm not sure about our current packages. Would you like me to check and get back to you?";
          return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }
      } catch (err) {
        this.logger.error('Failed to fetch packages for FAQ', err);
        const response = "I'm not sure about our current packages. Would you like me to check and get back to you?";
        return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
      }
    }

    // Route flows for non-package queries
    if (intent === 'faq' || intent === 'other') {
      const reply = await this.answerFaq(message, history);
      return { response: reply, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: reply }] };
    }

    // Booking flow
    draft = draft ?? await this.getOrCreateDraft(customerId);

    const extraction = await this.extractBookingDetails(message, history);
    this.logger.debug('extraction', JSON.stringify(extraction));

    const merged = await this.mergeIntoDraft(customerId, extraction);

    if (extraction.subIntent === 'cancel') {
      await this.prisma.bookingDraft.delete({ where: { customerId } }).catch(() => null);
      const cancelReply = 'No problem — I cancelled the booking. Anything else I can help with?';
      return { response: cancelReply, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: cancelReply }] };
    }

    const completionResult = await this.checkAndCompleteIfConfirmed(merged, extraction, customerId, bookingsService);
    if (completionResult.action === 'deposit_initiated') {
      // New: Poll payment status by checkoutRequestId and update user in chat
      const depositMessage = completionResult.message;
      const checkoutRequestId = completionResult.checkoutRequestId;
      let pollAttempts = 0;
      const maxPollAttempts = 12; // e.g., poll for up to 2 minutes (10s interval)
      const pollIntervalMs = 10000;
      let paymentStatus = 'pending';
      let payment;
      while (pollAttempts < maxPollAttempts && paymentStatus === 'pending') {
        await new Promise(res => setTimeout(res, pollIntervalMs));
        try {
          // Direct DB query for reliability (or use HTTP if preferred)
          payment = await this.prisma.payment.findFirst({ where: { checkoutRequestId } });
          paymentStatus = payment?.status || 'pending';
        } catch (err) {
          this.logger.warn('Polling payment status failed', err);
        }
        pollAttempts++;
      }
      if (paymentStatus === 'success') {
        const confirmMsg = 'Payment received! Your booking is now confirmed. We’ll send you a reminder closer to the date. 💖';
        return {
          response: depositMessage + '\n\n' + confirmMsg,
          draft: null,
          updatedHistory: [
            ...history.slice(-this.historyLimit),
            { role: 'user', content: message },
            { role: 'assistant', content: depositMessage },
            { role: 'assistant', content: confirmMsg }
          ]
        };
      } else if (paymentStatus === 'failed') {
        const failMsg = 'Payment failed or was not completed. Please try again or contact support.';
        return {
          response: depositMessage + '\n\n' + failMsg,
          draft: merged,
          updatedHistory: [
            ...history.slice(-this.historyLimit),
            { role: 'user', content: message },
            { role: 'assistant', content: depositMessage },
            { role: 'assistant', content: failMsg }
          ]
        };
      } else {
        const timeoutMsg = 'We did not receive payment confirmation in time. If you completed the payment, please wait a moment or contact support.';
        return {
          response: depositMessage + '\n\n' + timeoutMsg,
          draft: merged,
          updatedHistory: [
            ...history.slice(-this.historyLimit),
            { role: 'user', content: message },
            { role: 'assistant', content: depositMessage },
            { role: 'assistant', content: timeoutMsg }
          ]
        };
      }
    }
    if (completionResult.action === 'unavailable') {
      const suggestions = (completionResult.suggestions || []).slice(0, 3).map((s: string | Date) => {
        const dt = typeof s === 'string' ? DateTime.fromISO(s) : DateTime.fromJSDate(new Date(s));
        return dt.setZone(this.studioTz).toLocaleString(DateTime.DATETIME_MED);
      });
      const reply = `Sorry, that slot is no longer available. Nearby alternatives: ${suggestions.join(', ')}. Would any of these work?`;
      return { response: reply, draft: merged, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: reply }] };
    }

    const reply = await this.generateBookingReply(message, merged, extraction, history, bookingsService);
    return { response: reply, draft: merged, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: reply }] };
  }

  // Legacy / helper methods
  async addKnowledge(question: string, answer: string) {
    // Always write to your DB first (so seeding still persists even if Pinecone fails)
    await this.prisma.knowledgeBase.create({
      data: {
        question,
        answer,
        category: 'general',
        embedding: await this.generateEmbedding(question + ' ' + answer),
      },
    });

    // If we have a valid Pinecone index, try to upsert as well.
    if (!this.index) {
      this.logger.debug('addKnowledge: Pinecone index not available, saved to DB only.');
      return;
    }

    try {
      await this.index.upsert([{
        id: `kb-${Date.now()}`,
        values: await this.generateEmbedding(question + ' ' + answer),
        metadata: { question, answer },
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
      prediction = result.response;
      // Optionally, you could pass actual/expected answer if available
      // For now, we log only the prediction
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
    return result.response;
  }

  async generateGeneralResponse(message: string, customerId: string, bookingsService: any, history?: any[]): Promise<string> {
    const result = await this.handleConversation(message, customerId, history || [], bookingsService);
    return result.response;
  }
}
