"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
const pinecone_1 = require("@pinecone-database/pinecone");
const prisma_service_1 = require("../../prisma/prisma.service");
function extractModelVersion(model) {
    if (!model)
        return '';
    const match = model.match(/(gpt-[^\s]+)/);
    return match ? match[1] : model;
}
const bookings_service_1 = require("../bookings/bookings.service");
const chrono = require("chrono-node");
const luxon_1 = require("luxon");
let AiService = AiService_1 = class AiService {
    constructor(configService, prisma, bookingsService, aiQueue) {
        this.configService = configService;
        this.prisma = prisma;
        this.bookingsService = bookingsService;
        this.aiQueue = aiQueue;
        this.logger = new common_1.Logger(AiService_1.name);
        this.pinecone = null;
        this.index = null;
        this.studioTz = 'Africa/Nairobi';
        this.historyLimit = 6;
        this.businessLocation = 'Our studio is located at 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor. We look forward to welcoming you! 💖';
        this.openai = new openai_1.OpenAI({ apiKey: this.configService.get('OPENAI_API_KEY') });
        this.embeddingModel = this.configService.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
        this.extractorModel = this.configService.get('OPENAI_EXTRACTOR_MODEL', 'gpt-4o');
        this.chatModel = this.configService.get('OPENAI_CHAT_MODEL', 'gpt-4o');
        this.initPineconeSafely();
    }
    initPineconeSafely() {
        const apiKey = this.configService.get('PINECONE_API_KEY');
        const indexName = this.configService.get('PINECONE_INDEX_NAME');
        let env = this.configService.get('PINECONE_ENVIRONMENT');
        const host = this.configService.get('PINECONE_HOST');
        if (!apiKey || !indexName) {
            this.logger.warn('Pinecone disabled: missing PINECONE_API_KEY or PINECONE_INDEX_NAME in env.');
            this.pinecone = null;
            this.index = null;
            return;
        }
        if (env && env.startsWith('http')) {
            this.logger.warn('PINECONE_ENVIRONMENT contains a URL. Treating it as PINECONE_HOST. Please set PINECONE_HOST instead and set PINECONE_ENVIRONMENT to a short region (e.g., us-east-1) or leave it unset.');
            if (!host) {
                this.configService.PINECONE_HOST = env;
            }
            env = undefined;
        }
        try {
            if (env && !env.startsWith('http')) {
                this.pinecone = new pinecone_1.Pinecone({
                    apiKey,
                    environment: env,
                });
                this.index = this.pinecone.index(indexName);
                this.logger.log(`Pinecone initialized with environment="${env}", index="${indexName}".`);
                return;
            }
            if (host) {
                this.pinecone = new pinecone_1.Pinecone({ apiKey });
                try {
                    this.index = this.pinecone.index(indexName);
                    this.logger.log(`Pinecone initialized with HOST="${host}", index="${indexName}".`);
                    return;
                }
                catch (_) {
                    try {
                        this.pinecone.baseUrl = host;
                        if (typeof this.pinecone.Index === 'function') {
                            this.index = this.pinecone.Index(indexName);
                        }
                        else {
                            this.index = this.pinecone.index(indexName);
                        }
                        this.logger.log(`Pinecone initialized (fallback) with HOST="${host}", index="${indexName}".`);
                        return;
                    }
                    catch (e2) {
                        throw e2;
                    }
                }
            }
            this.logger.warn('Pinecone not initialized: set PINECONE_ENVIRONMENT (short region) or PINECONE_HOST (full index host URL). Continuing in DB-only mode.');
            this.pinecone = null;
            this.index = null;
        }
        catch (err) {
            this.logger.warn('Pinecone initialization failed. Falling back to DB-only mode. Error:', err);
            this.pinecone = null;
            this.index = null;
        }
    }
    normalizeDateTime(rawDate, rawTime) {
        if (!rawDate && !rawTime)
            return null;
        const input = [rawDate, rawTime].filter(Boolean).join(' ');
        try {
            let parsed = chrono.parseDate(input, new Date());
            if (!parsed) {
                parsed = chrono.parseDate(rawDate ?? rawTime ?? '', new Date());
            }
            if (!parsed) {
                this.logger.warn('normalizeDateTime could not parse input', { rawDate, rawTime });
                return null;
            }
            const dt = luxon_1.DateTime.fromJSDate(parsed).setZone(this.studioTz);
            const isoUtc = dt.toUTC().toISO();
            return { isoUtc, dateOnly: dt.toFormat('yyyy-MM-dd'), timeOnly: dt.toFormat('HH:mm') };
        }
        catch (err) {
            this.logger.warn('normalizeDateTime failed', err);
            return null;
        }
    }
    async generateEmbedding(text) {
        const r = await this.openai.embeddings.create({ model: this.embeddingModel, input: text });
        return r.data[0].embedding;
    }
    async retrieveRelevantDocs(query, topK = 3) {
        if (!this.index) {
            this.logger.debug('retrieveRelevantDocs: Pinecone index not available - returning empty result (DB-only).');
            return [];
        }
        try {
            const vec = await this.generateEmbedding(query);
            const resp = await this.index.query({ vector: vec, topK, includeMetadata: true });
            return resp.matches ?? [];
        }
        catch (err) {
            this.logger.warn('retrieveRelevantDocs: Pinecone query failed', err);
            return [];
        }
    }
    async answerFaq(question, history = [], actual, customerId) {
        let prediction = '';
        let confidence = undefined;
        let error = undefined;
        const start = Date.now();
        try {
            const docs = await this.retrieveRelevantDocs(question, 3);
            if (docs.length > 0) {
                prediction = docs[0].metadata.answer;
                confidence = docs[0].score;
                return prediction;
            }
            const messages = [
                {
                    role: 'system',
                    content: `You are a loving, emotionally intelligent assistant for a maternity photoshoot studio. Your clients are expectant mothers and their families, who may ask about anything—studio services, life, pregnancy, or even unrelated topics. Always answer with warmth, flexibility, and genuine care. Use sweet, supportive, and human language. If you don't know something, respond with kindness and offer to help or find out. Never sound like a bot—be a resourceful, creative, and emotionally present friend who can help with any question or need. If the user asks for business details, provide them clearly and warmly.

IMPORTANT: You MUST base your answer STRICTLY on the provided Context messages below. Do NOT invent, hallucinate, or add any information not explicitly stated in the contexts. If contexts describe packages, services, prices, or details, list and describe them EXACTLY as written—do not create new names, prices, or features. If no relevant context, say you need to check or offer general support.`,
                },
            ];
            docs.forEach((d, i) => {
                const md = d.metadata ?? {};
                messages.push({ role: 'system', content: `Context ${i + 1}: ${md.answer ?? md.text ?? ''}` });
            });
            messages.push(...history.slice(-this.historyLimit).map(h => ({ role: h.role, content: h.content })));
            messages.push({ role: 'user', content: question });
            const rsp = await this.openai.chat.completions.create({
                model: this.chatModel,
                messages,
                max_tokens: 220,
                temperature: 0.0,
            });
            prediction = rsp.choices[0].message.content.trim();
            return prediction;
        }
        catch (err) {
            this.logger.error('answerFaq error', err);
            error = err?.message || String(err);
            prediction = "I'm not sure about that but I can check for you.";
            return prediction;
        }
        finally {
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
                }
                catch (logErr) {
                    this.logger.warn('Failed to log AiPrediction', logErr);
                }
            }
        }
    }
    async extractBookingDetails(message, history = []) {
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
        const messages = [{ role: 'system', content: systemPrompt }];
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
            const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            const objMatch = content.match(/\{[\s\S]*\}/);
            const jsonText = fenced ? fenced[1] : (objMatch ? objMatch[0] : content);
            let parsed = {};
            try {
                parsed = JSON.parse(jsonText);
            }
            catch (parseErr) {
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
        }
        catch (err) {
            this.logger.error('extractBookingDetails error', err);
            return { subIntent: 'unknown' };
        }
    }
    async generateBookingReply(message, draft, extraction, history = [], bookingsService) {
        const missing = [];
        if (!draft.service)
            missing.push('service');
        if (!draft.date)
            missing.push('date');
        if (!draft.time)
            missing.push('time');
        if (!draft.name)
            missing.push('name');
        if (draft.isForSomeoneElse) {
            if (!draft.recipientName)
                missing.push('recipientName');
            if (!draft.recipientPhone)
                missing.push('recipientPhone');
        }
        else {
            if (!draft.recipientName)
                draft.recipientName = draft.name;
            if (!draft.recipientPhone)
                missing.push('recipientPhone');
        }
        const nextStep = missing.length === 0 ? 'confirm' : missing[0];
        const isUpdate = extraction.service || extraction.date || extraction.time || extraction.name || extraction.recipientName || extraction.recipientPhone;
        let packagesInfo = '';
        if (nextStep === 'service') {
            try {
                const packages = await this.bookingsService.getPackages();
                packagesInfo = `Available packages: ${packages.map((p) => `${p.name} (${p.duration}, KSH ${p.price})`).join('; ')}.`;
            }
            catch (err) {
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
        const messages = [{ role: 'system', content: sys }];
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
        }
        catch (err) {
            this.logger.error('generateBookingReply error', err);
            return "Sorry — I had trouble composing a reply. Can you confirm the details?";
        }
    }
    async getOrCreateDraft(customerId) {
        let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        if (!draft) {
            draft = await this.prisma.bookingDraft.create({
                data: { customerId, step: 'service', version: 1 },
            });
        }
        return draft;
    }
    async mergeIntoDraft(customerId, extraction) {
        const existingDraft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        const updates = {};
        if (extraction.service)
            updates.service = extraction.service;
        if (extraction.date)
            updates.date = extraction.date;
        if (extraction.time)
            updates.time = extraction.time;
        if (extraction.name)
            updates.name = extraction.name;
        if (extraction.recipientName)
            updates.recipientName = extraction.recipientName;
        if (extraction.recipientPhone)
            updates.recipientPhone = extraction.recipientPhone;
        if (extraction.isForSomeoneElse !== undefined)
            updates.isForSomeoneElse = extraction.isForSomeoneElse;
        if (Object.keys(updates).length === 0) {
            return existingDraft;
        }
        if (updates.date && updates.time) {
            const normalized = this.normalizeDateTime(updates.date, updates.time);
            if (normalized) {
                updates.date = normalized.dateOnly;
                updates.time = normalized.timeOnly;
                updates.dateTimeIso = normalized.isoUtc;
            }
            else {
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
    async checkAndCompleteIfConfirmed(draft, extraction, customerId, bookingsService) {
        const missing = [];
        if (!draft.service)
            missing.push('service');
        if (!draft.date)
            missing.push('date');
        if (!draft.time)
            missing.push('time');
        if (!draft.name)
            missing.push('name');
        if (draft.isForSomeoneElse) {
            if (!draft.recipientName)
                missing.push('recipientName');
            if (!draft.recipientPhone)
                missing.push('recipientPhone');
        }
        else {
            if (!draft.recipientName) {
                draft.recipientName = draft.name;
                this.logger.debug(`Defaulted recipientName to name for self-booking: ${draft.recipientName}`);
                await this.mergeIntoDraft(customerId, { recipientName: draft.name });
            }
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
                return { action: 'deposit_initiated', message: result.message };
            }
            catch (err) {
                this.logger.error('Deposit initiation failed in checkAndCompleteIfConfirmed', err);
                return { action: 'failed', error: 'There was an issue initiating payment. Please try again or contact support.' };
            }
        }
        else {
            this.logger.warn('Booking draft incomplete; missing fields:', missing);
            return { action: 'incomplete', missing };
        }
    }
    async handleConversation(message, customerId, history = [], bookingsService) {
        let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        const hasDraft = !!draft;
        const lower = (message || '').toLowerCase();
        const locationQueryKeywords = ['location', 'where', 'address', 'located', 'studio location', 'studio address', 'where are you', 'where is the studio', 'studio address'];
        if (locationQueryKeywords.some((kw) => lower.includes(kw))) {
            const locationResponse = this.businessLocation;
            const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: locationResponse }];
            return { response: locationResponse, draft: null, updatedHistory };
        }
        let intent = 'other';
        if (hasDraft) {
            intent = 'booking';
        }
        else {
            if (/(book|appointment|reserve|schedule|slot|available|tomorrow|next)/.test(lower))
                intent = 'booking';
            else if (/\?/.test(message) || /(price|cost|how much|hours|open|service)/.test(lower))
                intent = 'faq';
            else {
                try {
                    const classifierMsg = [
                        { role: 'system', content: 'Classify the user intent as "faq", "booking", or "other". Return JSON only: { "intent": "<label>" }' },
                        ...history.slice(-3).map(h => ({ role: h.role, content: h.content })),
                        { role: 'user', content: message },
                    ];
                    const cresp = await this.openai.chat.completions.create({ model: this.chatModel, messages: classifierMsg, max_tokens: 16, temperature: 0.0 });
                    const cret = cresp.choices[0].message.content;
                    const m = cret.match(/"(faq|booking|other)"/) || cret.match(/\{\s*"intent"\s*:\s*"(faq|booking|other)"\s*\}/);
                    if (m)
                        intent = m[1];
                }
                catch (e) {
                    this.logger.warn('intent classifier fallback failed', e);
                }
            }
        }
        if (intent !== 'booking' && /(package|price|cost|how much|offer|studio|outdoor)/.test(lower)) {
            try {
                this.logger.log('Fetching packages from DB for package-related query');
                const allPackages = await this.bookingsService.getPackages();
                if (allPackages && allPackages.length > 0) {
                    let packages = allPackages;
                    let packageType = '';
                    if (/(outdoor)/.test(lower)) {
                        packages = allPackages.filter((p) => p.type?.toLowerCase() === 'outdoor');
                        packageType = 'outdoor ';
                    }
                    else if (/(studio)/.test(lower)) {
                        packages = allPackages.filter((p) => p.type?.toLowerCase() === 'studio');
                        packageType = 'studio ';
                    }
                    if (packages.length > 0) {
                        const packagesList = packages.map((p) => {
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
                    }
                    else {
                        const response = `I'm not sure about our current ${packageType}packages. Would you like me to check and get back to you?`;
                        return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                    }
                }
                else {
                    this.logger.warn('No packages found in DB');
                    const response = "I'm not sure about our current packages. Would you like me to check and get back to you?";
                    return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                }
            }
            catch (err) {
                this.logger.error('Failed to fetch packages for FAQ', err);
                const response = "I'm not sure about our current packages. Would you like me to check and get back to you?";
                return { response, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
            }
        }
        if (intent === 'faq' || intent === 'other') {
            const reply = await this.answerFaq(message, history);
            return { response: reply, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: reply }] };
        }
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
            const depositMessage = completionResult.message;
            return { response: depositMessage, draft: merged, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: depositMessage }] };
        }
        if (completionResult.action === 'unavailable') {
            const suggestions = (completionResult.suggestions || []).slice(0, 3).map((s) => {
                const dt = typeof s === 'string' ? luxon_1.DateTime.fromISO(s) : luxon_1.DateTime.fromJSDate(new Date(s));
                return dt.setZone(this.studioTz).toLocaleString(luxon_1.DateTime.DATETIME_MED);
            });
            const reply = `Sorry, that slot is no longer available. Nearby alternatives: ${suggestions.join(', ')}. Would any of these work?`;
            return { response: reply, draft: merged, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: reply }] };
        }
        const reply = await this.generateBookingReply(message, merged, extraction, history, bookingsService);
        return { response: reply, draft: merged, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: reply }] };
    }
    async addKnowledge(question, answer) {
        await this.prisma.knowledgeBase.create({
            data: {
                question,
                answer,
                category: 'general',
                embedding: await this.generateEmbedding(question + ' ' + answer),
            },
        });
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
        }
        catch (err) {
            this.logger.warn('addKnowledge: failed to upsert to Pinecone (saved to DB only).', err);
        }
    }
    async processAiRequest(data) {
        const answer = await this.answerFaq(data.question, []);
        return answer;
    }
    async generateResponse(message, customerId, bookingsService, history, extractedBooking, faqContext) {
        const start = Date.now();
        let prediction = '';
        let error = undefined;
        let actual = undefined;
        let confidence = undefined;
        let modelVersion = extractModelVersion(this.chatModel);
        try {
            const result = await this.handleConversation(message, customerId, history || [], bookingsService);
            prediction = result.response;
            return prediction;
        }
        catch (err) {
            error = err?.message || String(err);
            throw err;
        }
        finally {
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
            }
            catch (logErr) {
                this.logger.warn('Failed to log AiPrediction', logErr);
            }
        }
    }
    async extractStepBasedBookingDetails(message, currentStep, history) {
        return { nextStep: currentStep };
    }
    async generateStepBasedBookingResponse(message, customerId, bookingsService, history = [], draft, bookingResult) {
        const result = await this.handleConversation(message, customerId, history, bookingsService);
        return result.response;
    }
    async generateGeneralResponse(message, customerId, bookingsService, history) {
        const result = await this.handleConversation(message, customerId, history || [], bookingsService);
        return result.response;
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => bookings_service_1.BookingsService))),
    __param(3, (0, bull_1.InjectQueue)('aiQueue')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        bookings_service_1.BookingsService, Object])
], AiService);
//# sourceMappingURL=ai.service.js.map