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
const chrono = require("chrono-node");
const luxon_1 = require("luxon");
const prisma_service_1 = require("../../prisma/prisma.service");
const bookings_service_1 = require("../bookings/bookings.service");
const messages_service_1 = require("../messages/messages.service");
const escalation_service_1 = require("../escalation/escalation.service");
const circuit_breaker_service_1 = require("./services/circuit-breaker.service");
function extractModelVersion(model) {
    if (!model)
        return '';
    const match = model.match(/(gpt-[^\s]+)/);
    return match ? match[1] : model;
}
const package_inquiry_strategy_1 = require("./strategies/package-inquiry.strategy");
const booking_strategy_1 = require("./strategies/booking.strategy");
const customer_memory_service_1 = require("./services/customer-memory.service");
const conversation_learning_service_1 = require("./services/conversation-learning.service");
const domain_expertise_service_1 = require("./services/domain-expertise.service");
const advanced_intent_service_1 = require("./services/advanced-intent.service");
const personalization_service_1 = require("./services/personalization.service");
const feedback_loop_service_1 = require("./services/feedback-loop.service");
const predictive_analytics_service_1 = require("./services/predictive-analytics.service");
let AiService = AiService_1 = class AiService {
    constructor(configService, prisma, circuitBreaker, bookingsService, messagesService, escalationService, aiQueue, customerMemory, conversationLearning, domainExpertise, advancedIntent, personalization, feedbackLoop, predictiveAnalytics) {
        this.configService = configService;
        this.prisma = prisma;
        this.circuitBreaker = circuitBreaker;
        this.bookingsService = bookingsService;
        this.messagesService = messagesService;
        this.escalationService = escalationService;
        this.aiQueue = aiQueue;
        this.customerMemory = customerMemory;
        this.conversationLearning = conversationLearning;
        this.domainExpertise = domainExpertise;
        this.advancedIntent = advancedIntent;
        this.personalization = personalization;
        this.feedbackLoop = feedbackLoop;
        this.predictiveAnalytics = predictiveAnalytics;
        this.logger = new common_1.Logger(AiService_1.name);
        this.pinecone = null;
        this.index = null;
        this.strategies = [];
        this.studioTz = 'Africa/Nairobi';
        this.historyLimit = 6;
        this.maxTokensPerDay = 100000;
        this.tokenUsageCache = new Map();
        this.packageCache = null;
        this.CACHE_TTL = 5 * 60 * 1000;
        this.businessName = 'Fiesta House Attire maternity photoshoot studio';
        this.businessLocation = 'Our studio is located at 4th Avenue Parklands, Diamond Plaza Annex, 2nd Floor. We look forward to welcoming you! 💖';
        this.businessWebsite = 'https://fiestahouseattire.com/';
        this.customerCarePhone = '0720 111928';
        this.customerCareEmail = 'info@fiestahouseattire.com';
        this.businessHours = 'Monday-Saturday: 9:00 AM - 6:00 PM';
        this.openai = new openai_1.default({ apiKey: this.configService.get('OPENAI_API_KEY') });
        this.embeddingModel = this.configService.get('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
        this.extractorModel = this.configService.get('OPENAI_EXTRACTOR_MODEL', 'gpt-4o');
        this.chatModel = this.configService.get('OPENAI_CHAT_MODEL', 'gpt-4o');
        this.initPineconeSafely();
        this.strategies = [
            new package_inquiry_strategy_1.PackageInquiryStrategy(),
            new booking_strategy_1.BookingStrategy(),
        ];
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
    async checkRateLimit(customerId) {
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
    async trackTokenUsage(customerId, tokensUsed) {
        const usage = this.tokenUsageCache.get(customerId);
        if (usage) {
            usage.count += tokensUsed;
        }
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
        }
        catch (err) {
            this.logger.warn('Failed to track token usage in database', err);
        }
    }
    calculateTokenCount(messages) {
        return messages.reduce((acc, msg) => acc + (msg.content?.length || 0) / 4, 0);
    }
    pruneHistory(history, maxTokens = 2000) {
        let total = 0;
        const pruned = [];
        for (let i = history.length - 1; i >= 0; i--) {
            const tokens = history[i].content.length / 4;
            if (total + tokens > maxTokens)
                break;
            pruned.unshift(history[i]);
            total += tokens;
        }
        return pruned;
    }
    async handleOpenAIFailure(error, customerId) {
        this.logger.error('OpenAI API failure', error);
        if (this.aiQueue) {
            await this.aiQueue.add('retry-message', { customerId, error: error.message });
        }
        if (error.code === 'insufficient_quota') {
            await this.escalationService?.createEscalation(customerId, 'AI service quota exceeded');
            return "I'm having technical difficulties. A team member will assist you shortly! 💖";
        }
        if (error.code === 'rate_limit_exceeded') {
            return "I'm receiving a lot of messages right now. Please give me a moment and try again! 💕";
        }
        return "I'm having trouble right now. Could you rephrase that, or would you like to speak with someone? 💕";
    }
    async detectFrustration(message, history) {
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
        const hasFrustrationWords = frustrationKeywords.some(kw => message.toLowerCase().includes(kw));
        return hasRepetition || hasFrustrationWords;
    }
    async getCachedPackages() {
        const now = Date.now();
        if (this.packageCache && (now - this.packageCache.timestamp) < this.CACHE_TTL) {
            return this.packageCache.data;
        }
        const packages = await this.prisma.package.findMany();
        this.packageCache = { data: packages, timestamp: now };
        return packages;
    }
    sanitizeInput(message) {
        return message
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .trim()
            .slice(0, 2000);
    }
    async retryOperation(operation, operationName, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`${operationName} failed on attempt ${attempt}/${maxRetries}:`, error);
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    this.logger.debug(`Retrying ${operationName} in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        this.logger.error(`${operationName} failed after ${maxRetries} attempts:`, lastError);
        throw lastError;
    }
    validatePhoneNumber(phone) {
        const kenyanPattern = /^(\+254|0)[17]\d{8}$/;
        return kenyanPattern.test(phone.replace(/\s/g, ''));
    }
    async checkBookingConflicts(customerId, dateTime) {
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
            const existing = luxon_1.DateTime.fromJSDate(existingBookings[0].dateTime);
            const conflictMessage = `You already have a booking on ${existing.toFormat('MMM dd')}. Would you like to modify that instead?`;
            const dateStr = luxon_1.DateTime.fromJSDate(dateTime).toISODate();
            const availableSlots = await this.bookingsService.getAvailableSlotsForDate(dateStr);
            return {
                conflict: conflictMessage,
                suggestions: availableSlots.slice(0, 5)
            };
        }
        return { conflict: null };
    }
    async trackConversationMetrics(customerId, metrics) {
        try {
            await this.prisma.conversationMetrics.create({
                data: {
                    customerId,
                    ...metrics,
                    timestamp: new Date(),
                },
            });
        }
        catch (err) {
            this.logger.warn('Failed to track conversation metrics', err);
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
        let docs = [];
        try {
            const cleanQuery = query.replace(/[^\w\s]/gi, '').trim();
            if (cleanQuery.length > 3) {
                const dbMatches = await this.prisma.knowledgeBase.findMany({
                    where: {
                        AND: [
                            {
                                OR: [
                                    { question: { equals: query, mode: 'insensitive' } },
                                    { question: { contains: cleanQuery, mode: 'insensitive' } },
                                ]
                            },
                            ...(cleanQuery.split(' ').length > 3 ? cleanQuery.split(' ').filter(w => w.length > 3).map(w => ({
                                question: { contains: w, mode: 'insensitive' }
                            })) : [])
                        ]
                    },
                    take: 2
                });
                if (dbMatches.length > 0) {
                    docs.push(...dbMatches.map(f => ({
                        id: f.id,
                        score: 0.95,
                        metadata: {
                            answer: f.answer,
                            text: f.question,
                            category: f.category,
                            mediaUrls: []
                        }
                    })));
                    this.logger.debug(`retrieveRelevantDocs: Found ${dbMatches.length} DB text matches`);
                }
            }
        }
        catch (err) {
            this.logger.warn('retrieveRelevantDocs: DB text search failed', err);
        }
        if (this.index) {
            try {
                const vec = await this.generateEmbedding(query);
                const resp = await this.index.query({ vector: vec, topK, includeMetadata: true });
                if (resp.matches) {
                    const existingIds = new Set(docs.map(d => d.id));
                    const newMatches = resp.matches.filter(m => !existingIds.has(m.id));
                    docs.push(...newMatches);
                }
            }
            catch (err) {
                this.logger.warn('retrieveRelevantDocs: Pinecone query failed', err);
            }
        }
        else {
            if (docs.length === 0) {
                this.logger.debug('retrieveRelevantDocs: Pinecone index not available & no text match - falling back to recent items.');
                try {
                    const faqs = await this.prisma.knowledgeBase.findMany({
                        take: 5,
                        orderBy: { createdAt: 'desc' },
                    });
                    docs.push(...faqs.map(f => ({
                        id: f.id, score: 0.5, metadata: { answer: f.answer, text: f.question, category: f.category }
                    })));
                }
                catch (err) { }
            }
        }
        return docs.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, topK);
    }
    formatPackageDetails(pkg, detailed = false) {
        if (!pkg)
            return '';
        const name = pkg.name ?? 'Unnamed Package';
        const type = pkg.type === 'outdoor' ? 'Outdoor' : 'Studio';
        const duration = pkg.duration ?? 'Duration not specified';
        const price = pkg.price !== undefined && pkg.price !== null ? `${pkg.price.toLocaleString()} KSH` : 'Price not available';
        const deposit = pkg.deposit !== undefined && pkg.deposit !== null ? `${pkg.deposit.toLocaleString()} KSH` : 'Contact us';
        const features = [];
        if (pkg.images)
            features.push(`${pkg.images} soft copy image${pkg.images > 1 ? 's' : ''} `);
        if (pkg.outfits)
            features.push(`${pkg.outfits} outfit change${pkg.outfits > 1 ? 's' : ''} `);
        if (pkg.makeup)
            features.push('Professional makeup');
        if (pkg.styling)
            features.push('Professional styling');
        if (pkg.balloonBackdrop)
            features.push('Customized balloon backdrop');
        if (pkg.wig)
            features.push('Styled wig');
        if (pkg.photobook) {
            const size = pkg.photobookSize ? ` (${pkg.photobookSize})` : '';
            features.push(`Photobook${size} `);
        }
        if (pkg.mount)
            features.push('A3 mount');
        if (detailed) {
            let message = `📦 * ${name}* (${type}) \n\n`;
            message += `⏱️ Duration: ${duration} \n`;
            message += `💰 Price: ${price} | Deposit: ${deposit} \n\n`;
            if (features.length > 0) {
                message += `✨ What's Included:\n`;
                features.forEach(f => message += `• ${f}\n`);
            }
            if (pkg.notes) {
                message += `\n📝 ${pkg.notes}`;
            }
            return message;
        }
        else {
            let brief = `*${name}*: ${duration}, ${price}`;
            if (features.length > 0) {
                const keyFeatures = features.slice(0, 3).join(', ');
                brief += ` — Includes: ${keyFeatures}`;
                if (features.length > 3)
                    brief += `, and more`;
            }
            return brief;
        }
    }
    async answerFaq(question, history = [], actual, customerId, enrichedContext) {
        let prediction = '';
        let confidence = undefined;
        let error = undefined;
        const start = Date.now();
        let mediaUrls = [];
        try {
            const backdropRegex = /(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio))/i;
            let isBackdropQuery = backdropRegex.test(question);
            this.logger.debug(`[AiService] Question: "${question}", isBackdropQuery: ${isBackdropQuery}`);
            if (isBackdropQuery) {
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
            const docs = await this.retrieveRelevantDocs(question, 10);
            if (docs.length > 0) {
                prediction = docs[0].metadata.answer;
                confidence = docs[0].score;
                this.logger.debug(`[AiService] FAQ match found. Using FAQ answer: "${prediction}" (score: ${confidence})`);
                if (docs[0].metadata.mediaUrls && Array.isArray(docs[0].metadata.mediaUrls)) {
                    mediaUrls.push(...docs[0].metadata.mediaUrls);
                }
            }
            else {
                this.logger.warn(`[AiService] No FAQ match found in DB for question: "${question}". Falling back to LLM.`);
                const messages = [
                    {
                        role: 'system',
                        content: `You are a warm, empathetic AI assistant for a maternity photoshoot studio. Always answer with genuine care and conversational intelligence.

IMPORTANT: Before generating any answer, ALWAYS check the database FAQs provided in context. If a relevant FAQ is found, use its answer directly and do NOT invent or hallucinate. Only generate a new answer if no FAQ matches.

META-COGNITIVE INSTRUCTIONS:
- LISTEN & ACKNOWLEDGE: Start by showing you understood the question ("Great question!" or "I'd love to help with that!")
- BE CONVERSATIONAL: Don't sound like you're reading from a manual. Sound like a knowledgeable friend
- PROVIDE CONTEXT: Don't just answer yes/no. Explain WHY when it helps
- CHECK BOOKINGS: If the user asks about their bookings, use the context provided below.

CONTEXT - USER BOOKINGS:
${enrichedContext?.customer?.recentBookings ? JSON.stringify(enrichedContext.customer.recentBookings.map((b) => ({
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
                if (/(package|photobook|makeup|styling|balloon|wig|outfit|image|photo|shoot|session|include|feature|come with|have)/i.test(question)) {
                    try {
                        const packages = await this.getCachedPackages();
                        if (packages && packages.length > 0) {
                            let packageContext = '=== AVAILABLE PACKAGES FROM DATABASE ===\n\n';
                            packages.forEach((pkg) => {
                                packageContext += this.formatPackageDetails(pkg, true) + '\n\n---\n\n';
                            });
                            packageContext += '\nIMPORTANT: These are the ONLY packages that exist. You MUST NOT mention any package names not listed above.';
                            messages.push({ role: 'system', content: String(packageContext) });
                            this.logger.debug(`answerFaq: Added ${packages.length} packages to context`);
                        }
                    }
                    catch (err) {
                        this.logger.warn('answerFaq: Failed to fetch packages for context', err);
                    }
                }
                docs.forEach((d, i) => {
                    const md = d.metadata ?? {};
                    messages.push({ role: 'system', content: `Context ${i + 1}: ${md.answer ?? md.text ?? ''}` });
                });
                const prunedHistory = this.pruneHistory(history);
                messages.push(...prunedHistory.map(h => ({ role: h.role, content: h.content })));
                messages.push({ role: 'user', content: question });
                try {
                    const rsp = await this.openai.chat.completions.create({
                        model: this.chatModel,
                        messages,
                        max_tokens: 280,
                        temperature: 0.6,
                    });
                    prediction = rsp.choices[0].message.content.trim();
                    if (customerId && rsp.usage?.total_tokens) {
                        await this.trackTokenUsage(customerId, rsp.usage.total_tokens);
                    }
                }
                catch (err) {
                    if (customerId) {
                        prediction = await this.handleOpenAIFailure(err, customerId);
                    }
                    else {
                        throw err;
                    }
                }
            }
            if (mediaUrls.length > 0) {
                mediaUrls = [...new Set(mediaUrls)];
                prediction += `\n\nHere are some examples from our portfolio:`;
                mediaUrls = mediaUrls.slice(0, 6);
            }
            if (typeof prediction === 'string') {
                prediction = prediction.replace(/two weeks|14 days/gi, '10 working days');
                prediction = prediction.replace(/online gallery|email/gi, 'WhatsApp link');
            }
            return { text: prediction, mediaUrls };
        }
        catch (err) {
            this.logger.error('answerFaq error', err);
            error = err?.message || String(err);
            prediction = "I'm not sure about that but I can check for you.";
            return { text: prediction, mediaUrls };
        }
        finally {
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
                }
                catch (logErr) {
                    this.logger.warn('Failed to log AiPrediction', logErr);
                }
            }
        }
    }
    async extractBookingDetails(message, history = []) {
        const currentDate = luxon_1.DateTime.now().setZone(this.studioTz).toFormat('yyyy-MM-dd');
        const currentDayOfMonth = luxon_1.DateTime.now().setZone(this.studioTz).day;
        const currentMonth = luxon_1.DateTime.now().setZone(this.studioTz).toFormat('MMMM');
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
- "tomorrow" → ${luxon_1.DateTime.now().setZone(this.studioTz).plus({ days: 1 }).toFormat('yyyy-MM-dd')}
- "day after tomorrow" → ${luxon_1.DateTime.now().setZone(this.studioTz).plus({ days: 2 }).toFormat('yyyy-MM-dd')}
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
        const messages = [{ role: 'system', content: systemPrompt }];
        const prunedHistory = this.pruneHistory(history);
        messages.push(...prunedHistory.map(h => {
            let contentStr;
            if (typeof h.content === 'string') {
                contentStr = h.content;
            }
            else if (h.content && typeof h.content === 'object' && h.content.text) {
                contentStr = h.content.text;
            }
            else {
                contentStr = JSON.stringify(h.content);
            }
            return { role: h.role, content: contentStr };
        }));
        messages.push({ role: 'user', content: message });
        try {
            const rsp = await this.openai.chat.completions.create({
                model: this.extractorModel,
                messages,
                max_tokens: 200,
                temperature: 0.1,
            });
            let content = rsp.choices[0].message.content?.trim() ?? '';
            const fenced = content.match(/```(?: json) ?\s * ([\s\S] *?) \s * ```/i);
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
            const extraction = {
                service: typeof parsed.service === 'string' ? parsed.service : undefined,
                date: typeof parsed.date === 'string' ? parsed.date : undefined,
                time: typeof parsed.time === 'string' ? parsed.time : undefined,
                name: typeof parsed.name === 'string' ? parsed.name : undefined,
                recipientPhone: typeof parsed.recipientPhone === 'string' ? parsed.recipientPhone : undefined,
                subIntent: ['start', 'provide', 'confirm', 'cancel', 'reschedule', 'unknown'].includes(parsed.subIntent) ? parsed.subIntent : 'unknown',
            };
            if (extraction.date || extraction.time || extraction.service) {
                this.logger.debug(`[EXTRACTION] From "${message}" → ${JSON.stringify(extraction)}`);
            }
            return extraction;
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
        if (!draft.recipientPhone)
            missing.push('recipientPhone');
        if (!draft.recipientName && draft.name) {
            draft.recipientName = draft.name;
        }
        const nextStep = missing.length === 0 ? 'confirm' : missing[0];
        const isUpdate = extraction.service || extraction.date || extraction.time || extraction.name || extraction.recipientName || extraction.recipientPhone;
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
        if (nextStep === 'service' || /(package|price|pricing|cost|how much|offer|photoshoot|shoot|what do you have|what are|show me|tell me about|include|feature)/i.test(message)) {
            try {
                const packages = await this.getCachedPackages();
                if (packages && packages.length > 0) {
                    packagesInfo = '\n\n=== AVAILABLE PACKAGES FROM DATABASE ===\n\n';
                    packages.forEach((pkg) => {
                        packagesInfo += this.formatPackageDetails(pkg, true) + '\n\n---\n\n';
                    });
                    packagesInfo += 'CRITICAL: These are the ONLY packages that exist. You MUST NOT mention any package names not listed above (e.g., do NOT say "Classic", "Premium", or "Deluxe" if they are not in this list).';
                }
            }
            catch (err) {
                this.logger.warn('Failed to fetch packages for reply', err);
            }
        }
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
        const messages = [{ role: 'system', content: sys }];
        const prunedHistory = this.pruneHistory(history);
        messages.push(...prunedHistory.map(h => {
            let contentStr;
            if (typeof h.content === 'string') {
                contentStr = h.content;
            }
            else if (h.content && typeof h.content === 'object' && h.content.text) {
                contentStr = h.content.text;
            }
            else {
                contentStr = JSON.stringify(h.content);
            }
            return { role: h.role, content: contentStr };
        }));
        messages.push({ role: 'user', content: message });
        try {
            const rsp = await this.openai.chat.completions.create({
                model: this.chatModel,
                messages,
                max_tokens: 280,
                temperature: 0.75,
            });
            const reply = rsp.choices[0].message.content?.trim() ?? "How can I help with your booking?";
            if (isStuckOnField) {
                this.logger.log(`[RECOVERY] Generated alternative approach for stuck field: ${missing[0]}`);
            }
            return reply;
        }
        catch (err) {
            this.logger.error('generateBookingReply error', err);
            return "I'm having a little trouble right now. Could you tell me again what you'd like to book? 💕";
        }
    }
    async getOrCreateDraft(customerId) {
        let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        if (!draft) {
            let customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
            if (!customer) {
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
        if (extraction.recipientPhone) {
            if (this.validatePhoneNumber(extraction.recipientPhone)) {
                updates.recipientPhone = extraction.recipientPhone;
            }
            else {
                this.logger.warn(`Invalid phone number provided: ${extraction.recipientPhone}`);
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
        if (!draft.recipientPhone)
            missing.push('recipientPhone');
        if (!draft.recipientName) {
            draft.recipientName = draft.name;
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
            const { conflict, suggestions } = await this.checkBookingConflicts(customerId, dateObj);
            if (conflict) {
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
                if (extraction.subIntent === 'start' || extraction.subIntent === 'provide') {
                    await this.prisma.bookingDraft.delete({ where: { customerId } });
                    return {
                        action: 'new_booking',
                        message: 'Your previous booking is still active. Would you like to cancel it and create a new one?',
                        suggestions: suggestions || []
                    };
                }
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
            try {
                const result = await this.retryOperation(() => bookingsService.completeBookingDraft(customerId, dateObj), 'completeBookingDraft', 2, 1000);
                return {
                    action: 'payment_initiated',
                    message: result.message,
                    amount: result.depositAmount,
                    packageName: result.packageName,
                    checkoutRequestId: result.checkoutRequestId,
                    paymentId: result.paymentId
                };
            }
            catch (err) {
                this.logger.error('All retries for completeBookingDraft failed, cancelling booking draft', err);
                await this.prisma.bookingDraft.delete({ where: { customerId } });
                return {
                    action: 'cancelled',
                    message: 'We encountered repeated issues processing your booking. Your draft has been cancelled to avoid further problems. Please try booking again later or contact support if the issue persists.'
                };
            }
        }
        else {
            this.logger.warn('Booking draft incomplete; missing fields:', missing);
            return { action: 'incomplete', missing };
        }
    }
    async confirmCustomerPhone(customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (customer && customer.phone) {
            await this.mergeIntoDraft(customerId, { recipientPhone: customer.phone });
            return true;
        }
        return false;
    }
    async handleConversation(message, customerId, history = [], bookingsService, retryCount = 0, enrichedContext) {
        try {
            return await this.processConversationLogic(message, customerId, history, bookingsService, enrichedContext);
        }
        catch (err) {
            return this.attemptRecovery(err, { message, customerId, history, bookingsService, retryCount });
        }
    }
    async attemptRecovery(error, context) {
        if (context.retryCount > 1) {
            this.logger.error('Max retries exceeded in attemptRecovery', error);
            return {
                response: "I'm having a little trouble processing that right now. Could you try saying it differently? 🥺",
                draft: null,
                updatedHistory: context.history
            };
        }
        if (error.code === 'context_length_exceeded' || error.message?.includes('context_length_exceeded') || error.response?.data?.error?.code === 'context_length_exceeded') {
            this.logger.warn('Context length exceeded, retrying with shorter history');
            const shorterHistory = context.history.slice(-2);
            return this.handleConversation(context.message, context.customerId, shorterHistory, context.bookingsService, context.retryCount + 1);
        }
        throw error;
    }
    async processConversationLogic(message, customerId, history = [], bookingsService, enrichedContext) {
        const breakerCheck = await this.circuitBreaker.checkAndBreak(customerId, history);
        if (breakerCheck.shouldBreak) {
            this.logger.warn(`[CIRCUIT_BREAKER] 🔴 TRIPPED for customer ${customerId}: ${breakerCheck.reason || 'Unknown'}`);
            await this.circuitBreaker.recordTrip(customerId, breakerCheck.reason || 'Circuit breaker tripped');
            try {
                const existingDraft = await this.prisma.bookingDraft.findUnique({
                    where: { customerId },
                });
                if (existingDraft) {
                    await this.prisma.bookingDraft.delete({ where: { customerId } });
                    this.logger.log(`[CIRCUIT_BREAKER] Cleared draft for customer ${customerId}`);
                }
            }
            catch (err) {
                this.logger.error(`[CIRCUIT_BREAKER] Error clearing draft: ${err.message}`);
            }
            let recoveryMessage;
            if (breakerCheck.recovery === 'escalate') {
                recoveryMessage = `I apologize for the confusion! 😓 It seems I'm having trouble understanding your request. Let me connect you with our amazing team who can assist you personally!\n\nWould you like someone to call you, or would you prefer to reach out directly at ${this.customerCarePhone}? 💖`;
            }
            else if (breakerCheck.recovery === 'simplify') {
                recoveryMessage = `Let's start fresh! 🌸 I want to make sure I help you properly. Could you tell me in simple terms what you'd like to do today?\n\nFor example:\n✨ "I want to book a photoshoot"\n✨ "Tell me about your packages"\n✨ "I need to reschedule"\n\nWhat would you like help with? 💖`;
            }
            else {
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
        message = this.sanitizeInput(message);
        const withinLimit = await this.checkRateLimit(customerId);
        if (!withinLimit) {
            this.logger.warn(`Customer ${customerId} exceeded daily token limit`);
            const limitMsg = "I've reached my daily conversation limit with you. Our team will be in touch tomorrow, or you can contact us directly at " + this.customerCarePhone + ". 💖";
            return { response: limitMsg, draft: null, updatedHistory: [...history, { role: 'user', content: message }, { role: 'assistant', content: limitMsg }] };
        }
        const isFrustrated = await this.detectFrustration(message, history);
        if (isFrustrated && this.escalationService) {
            this.logger.log(`[SENTIMENT] Customer ${customerId} showing frustration - auto-escalating`);
            const sentimentScore = 0.8;
            await this.escalationService.createEscalation(customerId, 'Customer showing signs of frustration (auto-detected)', 'frustration', { sentimentScore, lastMessage: message, historyLength: history.length });
            const escalationMsg = "I sense you might be frustrated, and I'm so sorry! 😔 Let me connect you with a team member who can help you better. Someone will be with you shortly. 💖";
            return { response: escalationMsg, draft: null, updatedHistory: [...history, { role: 'user', content: message }, { role: 'assistant', content: escalationMsg }] };
        }
        let draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
        let hasDraft = !!draft;
        const lower = (message || '').toLowerCase();
        const greetingKeywords = ['hi', 'hello', 'hey', 'greetings', 'hallo', 'habari', 'good morning', 'good afternoon', 'good evening'];
        const cleanMsg = lower.replace(/[^\w\s]/g, '').trim();
        const isGreeting = greetingKeywords.some(kw => cleanMsg === kw || cleanMsg.startsWith(kw + ' '));
        if (isGreeting) {
            const greetingResponse = `Thank you for contacting Fiesta House Maternity, Kenya’s leading luxury photo studio specializing in maternity photography. We provide an all-inclusive experience in a world-class luxury studio, featuring world-class sets, professional makeup, and a curated selection of luxury gowns. We’re here to ensure your maternity shoot is an elegant, memorable, and stress-free experience.`;
            return {
                response: greetingResponse,
                draft: null,
                updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: greetingResponse }]
            };
        }
        const slotKeywords = [
            'available hours', 'available times', 'available slots', 'what times', 'what hours', 'when can i book',
            'when are you free', 'when is available', 'what time is available', 'what hour is available',
            'slots for', 'hours for', 'times for', 'slots tomorrow', 'hours tomorrow', 'times tomorrow',
            'open slots', 'open hours', 'open times', 'free slots', 'free hours', 'free times',
            'can i book tomorrow', 'can i book on', 'can i come on', 'can i come at', 'can i come tomorrow',
            'when can i come', 'when can i book', 'when is open', 'when are you open', 'when is free',
        ];
        const slotIntent = slotKeywords.some(kw => lower.includes(kw));
        const slotIntentRegex = /(available|free|open)\s+(hours|times|slots)(\s+(on|for|tomorrow|today|\d{4}-\d{2}-\d{2}))?/i;
        const slotIntentDetected = slotIntent || slotIntentRegex.test(message);
        if (slotIntentDetected) {
            let dateStr;
            if (/tomorrow/.test(lower)) {
                dateStr = luxon_1.DateTime.now().setZone(this.studioTz).plus({ days: 1 }).toFormat('yyyy-MM-dd');
            }
            else {
                const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch)
                    dateStr = dateMatch[1];
            }
            let service = draft?.service;
            if (!service) {
                if (this.bookingsService) {
                    const allPackages = await this.getCachedPackages();
                    const matched = allPackages.find((p) => lower.includes(p.name.toLowerCase()));
                    if (matched)
                        service = matched.name;
                }
            }
            if (dateStr && service) {
                const slots = await this.bookingsService.getAvailableSlotsForDate(dateStr, service);
                if (slots.length === 0) {
                    const msg = `Sorry, there are no available slots for ${service} on ${dateStr}. Would you like to try another date or package ? `;
                    return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                const prettySlots = slots.map(s => luxon_1.DateTime.fromISO(s).setZone(this.studioTz).toFormat('HH:mm')).join(', ');
                const msg = `Here are the available times for * ${service} * on * ${dateStr} *: \n${prettySlots} \nLet me know which time works for you!`;
                return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
            if (!service && !dateStr) {
                const msg = `To show available times, please tell me which package you'd like and for which date (e.g., "Studio Classic tomorrow").`;
                return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
            else if (!service) {
                const msg = `Which package would you like to see available times for on ${dateStr}?`;
                return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
            else if (!dateStr) {
                const msg = `For which date would you like to see available times for the *${service}* package? (e.g., "tomorrow" or "2025-11-20")`;
                return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
        }
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
            const allBookings = await this.prisma.booking.findMany({
                where: {
                    customerId: customer.id,
                },
                orderBy: { dateTime: 'desc' },
                take: 10,
            });
            let name = customer?.name || '';
            if (name && name.toLowerCase().startsWith('whatsapp user'))
                name = '';
            const who = name ? name : (customer?.phone ? customer.phone : 'dear');
            if (isViewBookingsRequest) {
                if (allBookings.length === 0) {
                    const msg = `Hi ${who}, you don't have any bookings yet. Would you like to make your first one? 💖`;
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                if (/(last|previous|recent)/.test(lower)) {
                    const lastBooking = allBookings[0];
                    const dt = luxon_1.DateTime.fromJSDate(lastBooking.dateTime).setZone(this.studioTz);
                    const msg = `Your last booking was:\n\n📅 *${lastBooking.service}*\n🗓️ Date: ${dt.toFormat('MMMM dd, yyyy')}\n🕐 Time: ${dt.toFormat('h:mm a')}\n✨ Status: ${lastBooking.status}\n\nWould you like to book another session? 🌸`;
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                if (/(upcoming|next|future)/.test(lower)) {
                    const now = new Date();
                    const upcomingBookings = allBookings.filter(b => b.dateTime > now && b.status === 'confirmed');
                    if (upcomingBookings.length === 0) {
                        const msg = `You don't have any upcoming bookings scheduled. Would you like to book a session? 💖`;
                        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                    }
                    const nextBooking = upcomingBookings[0];
                    const dt = luxon_1.DateTime.fromJSDate(nextBooking.dateTime).setZone(this.studioTz);
                    const msg = `Your next booking is:\n\n📅 *${nextBooking.service}*\n🗓️ Date: ${dt.toFormat('MMMM dd, yyyy')}\n🕐 Time: ${dt.toFormat('h:mm a')}\n✨ Status: ${nextBooking.status}\n\nWe're so excited to see you! 🌸`;
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                const bookingList = allBookings.slice(0, 5).map((b, i) => {
                    const dt = luxon_1.DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
                    return `${i + 1}. *${b.service}* - ${dt.toFormat('MMM dd, yyyy')} at ${dt.toFormat('h:mm a')} (${b.status})`;
                }).join('\n');
                const msg = `Here are your recent bookings:\n\n${bookingList}\n\n${allBookings.length > 5 ? `...and ${allBookings.length - 5} more!\n\n` : ''}Would you like to book another session? 🌸`;
                return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
            const count = allBookings.length;
            const msg = count === 0
                ? `Hi ${who}, I couldn't find any past bookings for you. Would you like to make your first one? 💖`
                : `Hi ${who}, you've made ${count} booking${count === 1 ? '' : 's'} with us. Thank you for being part of our studio family! Would you like to make another or view your past bookings? 🌸`;
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
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
            if (name && name.toLowerCase().startsWith('whatsapp user'))
                name = '';
            const phone = customer?.phone || customer?.whatsappId || '';
            let msg = '';
            if (name && phone)
                msg = `Your name is ${name} and your number is ${phone}. 😊`;
            else if (name)
                msg = `Your name is ${name}. 😊`;
            else if (phone)
                msg = `Your number is ${phone}. 😊`;
            else
                msg = `Sorry, I couldn't find your name or number. If you need help updating your profile, let me know!`;
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
        if (this.escalationService) {
            const isEscalated = await this.escalationService.isCustomerEscalated(customerId);
            if (isEscalated) {
                this.logger.debug(`Skipping AI response for escalated customer ${customerId}`);
                return { response: null, draft: null, updatedHistory: history };
            }
        }
        if (/(talk|speak).*(human|person|agent|representative)/i.test(message) || /(stupid|useless|hate|annoying|bad bot)/i.test(message)) {
            if (this.escalationService) {
                this.logger.log(`[ESCALATION] Customer ${customerId} requested handoff`);
                await this.escalationService.createEscalation(customerId, 'User requested human or expressed frustration');
                const msg = "I understand you'd like to speak with a human agent. I've notified our team, and someone will be with you shortly. In the meantime, I'll pause my responses. 💖";
                return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
        }
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
            if (draft) {
                await this.prisma.bookingDraft.delete({ where: { customerId } });
                this.logger.log(`[CANCELLATION] Deleted draft for customer ${customerId}`);
            }
            const confirmedBooking = await this.bookingsService?.getLatestConfirmedBooking(customerId);
            if (confirmedBooking) {
                if (/(yes|sure|confirm|please|do it|go ahead)/i.test(message)) {
                    await this.bookingsService.cancelBooking(confirmedBooking.id);
                    const msg = "All set! I've cancelled your booking. We hope to see you again soon! 💖 If you'd like to make a new booking, just let me know!";
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                else {
                    const bookingDate = luxon_1.DateTime.fromJSDate(confirmedBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy');
                    const msg = `You have a confirmed booking on ${bookingDate}. Are you sure you want to cancel it? Reply 'yes' to confirm cancellation.`;
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
            }
            const msg = draft
                ? "No problem! I've cleared your booking draft. Feel free to start fresh whenever you're ready! 💖"
                : "I don't see any active bookings or drafts to cancel. Would you like to start a new booking? 🌸";
            return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
        if (draft && draft.step === 'reschedule_confirm') {
            this.logger.log(`[RESCHEDULE] In confirmation state for customer ${customerId}`);
            if (/(yes|confirm|do it|sure|okay|fine|go ahead|please|yep|yeah)/i.test(message)) {
                const bookingId = draft.bookingId;
                const newDateObj = new Date(draft.dateTimeIso);
                if (bookingId && draft.dateTimeIso) {
                    await this.bookingsService.updateBooking(bookingId, { dateTime: newDateObj });
                    await this.prisma.bookingDraft.delete({ where: { customerId } });
                    const msg = `✅ Done! Your appointment has been rescheduled to *${luxon_1.DateTime.fromJSDate(newDateObj).setZone(this.studioTz).toFormat('ccc, LLL dd, yyyy \'at\' h:mm a')}*. See you then! 💖`;
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                else {
                    const msg = "I couldn't find the booking details to update. Please try again or contact support. 😓";
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
            }
            else if (/(no|cancel|different|another|change)/i.test(message)) {
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
            }
            else {
                const prettyDate = luxon_1.DateTime.fromISO(draft.dateTimeIso).setZone(this.studioTz).toFormat('ccc, LLL dd, yyyy \'at\' h:mm a');
                const msg = `I'm waiting for your confirmation to reschedule to *${prettyDate}*. Please reply "YES" to confirm or "NO" if you'd like a different time. 💖`;
                return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
            }
        }
        const isRescheduleIntent = /\b(reschedul\w*)\b/i.test(message) ||
            /(change|move|modify).*(booking|appointment|date|time)/i.test(message);
        if (isRescheduleIntent || (draft && draft.step === 'reschedule')) {
            this.logger.log(`[RESCHEDULE] Detected intent or active flow for customer ${customerId}`);
            if (!draft || draft.step !== 'reschedule') {
                const allBookings = await this.prisma.booking.findMany({
                    where: {
                        customerId,
                        status: 'confirmed',
                        dateTime: { gte: new Date() },
                    },
                    orderBy: { dateTime: 'asc' },
                });
                if (allBookings.length === 0) {
                    const msg = "I'd love to help you reschedule, but I can't find a current booking for you. Would you like to make a new one? 💖";
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                let targetBooking = allBookings[0];
                const dateMatch = message.match(/(\d{1,2})(st|nd|rd|th)?\s*(dec|december|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november)/i);
                if (dateMatch && allBookings.length > 1) {
                    const day = parseInt(dateMatch[1]);
                    const monthStr = dateMatch[3].toLowerCase();
                    const monthMap = {
                        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
                        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
                        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
                        nov: 10, november: 10, dec: 11, december: 11
                    };
                    const month = monthMap[monthStr];
                    const matchedBooking = allBookings.find(b => {
                        const bookingDt = luxon_1.DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
                        return bookingDt.month === month + 1 && bookingDt.day === day;
                    });
                    if (matchedBooking) {
                        targetBooking = matchedBooking;
                        this.logger.log(`[RESCHEDULE] User specified booking on ${day} ${monthStr}, matched booking ID ${matchedBooking.id}`);
                    }
                }
                if (allBookings.length > 1 && !dateMatch) {
                    const bookingsList = allBookings.map((b, idx) => {
                        const dt = luxon_1.DateTime.fromJSDate(b.dateTime).setZone(this.studioTz);
                        return `${idx + 1}️⃣ ${b.service} on ${dt.toFormat('MMM dd, yyyy')} at ${dt.toFormat('h:mm a')}`;
                    }).join('\n');
                    const msg = `You have ${allBookings.length} upcoming bookings:\n\n${bookingsList}\n\nWhich one would you like to reschedule? Just tell me the date (e.g., "the one on Dec 6th") 🗓️`;
                    return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
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
                const extraction = await this.extractBookingDetails(message, history);
                if (extraction.date || extraction.time) {
                    draft = await this.mergeIntoDraft(customerId, extraction);
                    await this.prisma.bookingDraft.update({
                        where: { customerId },
                        data: { recipientPhone: targetBooking.id }
                    });
                }
                else {
                    const bookingDt = luxon_1.DateTime.fromJSDate(targetBooking.dateTime).setZone(this.studioTz);
                    const msg = `I can certainly help reschedule your ${targetBooking.service} appointment on ${bookingDt.toFormat('MMM dd')}! 🗓️ When would you like to move it to?`;
                    return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
            }
        }
        const newBookingPatterns = [
            /(new|fresh|another|different).*(booking|appointment|session)/i,
            /(create|make|start).*(new|fresh|another).*(booking)/i,
            /^(book|new booking|fresh booking)$/i,
        ];
        const isNewBookingIntent = newBookingPatterns.some(pattern => pattern.test(message));
        if (isNewBookingIntent) {
            const existingBooking = await this.bookingsService?.getLatestConfirmedBooking(customerId);
            if (existingBooking) {
                this.logger.log(`[NEW BOOKING] User wants new booking but has existing booking on ${existingBooking.dateTime}`);
                if (draft?.conflictResolution === 'cancel_existing') {
                    await this.bookingsService.cancelBooking(existingBooking.id);
                    await this.prisma.bookingDraft.update({
                        where: { customerId },
                        data: { conflictResolution: null }
                    });
                    this.logger.log(`[NEW BOOKING] Cancelled existing booking ${existingBooking.id}, proceeding with new booking`);
                }
                else if (draft?.conflictResolution === 'modify_existing') {
                    draft = await this.prisma.bookingDraft.upsert({
                        where: { customerId },
                        update: { step: 'reschedule', service: existingBooking.service, conflictResolution: null },
                        create: { customerId, step: 'reschedule', service: existingBooking.service },
                    });
                    const msg = "Great! Let's reschedule your existing booking. When would you like to move it to? 🗓️";
                    return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
                else {
                    const hasChoice = /(cancel|delete).*(existing|old|that)/i.test(message) ||
                        /(modify|reschedule|change).*(existing|it)/i.test(message) ||
                        /(different|another).*(date|time)/i.test(message);
                    if (hasChoice) {
                        if (/(cancel|delete).*(existing|old|that|booking)/i.test(message)) {
                            if (draft) {
                                await this.prisma.bookingDraft.update({
                                    where: { customerId },
                                    data: { conflictResolution: 'cancel_existing' }
                                });
                            }
                            else {
                                draft = await this.prisma.bookingDraft.create({
                                    data: { customerId, step: 'service', conflictResolution: 'cancel_existing' }
                                });
                            }
                            await this.bookingsService.cancelBooking(existingBooking.id);
                            const msg = "Done! I've cancelled your previous booking. Now let's create your new one! What package would you like? 💖";
                            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                        }
                        else if (/(modify|reschedule|change)/i.test(message)) {
                            draft = await this.prisma.bookingDraft.upsert({
                                where: { customerId },
                                update: { step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
                                create: { customerId, step: 'reschedule', service: existingBooking.service, conflictResolution: 'modify_existing' },
                            });
                            const msg = "Perfect! When would you like to reschedule your appointment to? 🗓️";
                            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                        }
                        else {
                            if (draft) {
                                await this.prisma.bookingDraft.update({
                                    where: { customerId },
                                    data: { conflictResolution: 'different_time', date: null, time: null, dateTimeIso: null }
                                });
                            }
                            else {
                                draft = await this.prisma.bookingDraft.create({
                                    data: { customerId, step: 'service', conflictResolution: 'different_time' }
                                });
                            }
                            const msg = "Got it! Let's book for a different date. Which package would you like? 🌸";
                            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                        }
                    }
                    else {
                        const bookingDate = luxon_1.DateTime.fromJSDate(existingBooking.dateTime).setZone(this.studioTz).toFormat('MMM dd, yyyy \'at\' h:mm a');
                        const msg = `I see you have a booking scheduled for ${bookingDate}. 💖\n\nWould you like to:\n1️⃣ Cancel that booking and create a fresh one\n2️⃣ Modify/reschedule your existing booking\n3️⃣ Keep it and book for a different date\n\nJust let me know what works best for you!`;
                        return { response: msg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                    }
                }
            }
        }
        if (draft && draft.step === 'reschedule') {
            this.logger.log(`[RESCHEDULE] Continuing reschedule flow for customer ${customerId}`);
            const faqPatterns = [
                /what (is|are|was|were)/i,
                /(tell|show|explain|describe).*(me|about)/i,
                /(how|when|where|why)/i,
                /my (last|latest|previous|current|next)/i,
                /(package|booking|appointment).*(did|have|choose|select|pick)/i,
            ];
            const isFaqQuestion = faqPatterns.some(pattern => pattern.test(message));
            if (isFaqQuestion && !/(to|for|at|on)\s+\d/i.test(message)) {
                this.logger.log(`[RESCHEDULE] User asked FAQ question while in reschedule mode, routing to FAQ`);
                const faqResponse = await this.answerFaq(message, history, undefined, customerId);
                const responseText = typeof faqResponse === 'object' && 'text' in faqResponse ? faqResponse.text : faqResponse;
                return { response: responseText, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: responseText }] };
            }
            const extraction = await this.extractBookingDetails(message, history);
            draft = await this.mergeIntoDraft(customerId, extraction);
            if (draft.date && draft.time) {
                const normalized = this.normalizeDateTime(draft.date, draft.time);
                if (normalized) {
                    const newDateObj = new Date(normalized.isoUtc);
                    const conflictResult = await this.checkBookingConflicts(customerId, newDateObj);
                    if (conflictResult.conflict) {
                        const msg = `I'm sorry, but it looks like you already have a booking around that time. ${conflictResult.conflict} Would you like to try a different time?`;
                        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                    }
                    const avail = await this.bookingsService.checkAvailability(newDateObj, draft.service);
                    if (!avail.available) {
                        const suggestions = (avail.suggestions || []).slice(0, 3).map((s) => {
                            const dt = typeof s === 'string' ? luxon_1.DateTime.fromISO(s) : luxon_1.DateTime.fromJSDate(new Date(s));
                            return dt.setZone(this.studioTz).toLocaleString(luxon_1.DateTime.DATETIME_MED);
                        });
                        const msg = `I checked that time, but it's currently unavailable. 😔\nHere are some nearby times that are open: ${suggestions.join(', ')}.\nDo any of those work for you?`;
                        return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                    }
                    await this.prisma.bookingDraft.update({
                        where: { customerId },
                        data: {
                            step: 'reschedule_confirm',
                            dateTimeIso: normalized.isoUtc
                        }
                    });
                    const prettyDate = luxon_1.DateTime.fromJSDate(newDateObj).setZone(this.studioTz).toFormat('ccc, LLL dd, yyyy \'at\' h:mm a');
                    const msg = `Great! I found an available slot on *${prettyDate}*. 🎉\n\nTo confirm this reschedule, please reply with "YES" or "CONFIRM". If you'd like a different time, just let me know! 💖`;
                    return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
                }
            }
            const msg = "Please let me know the new date and time you'd like. (e.g., 'Next Friday at 2pm') 🗓️";
            return { response: msg, draft, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: msg }] };
        }
        const isReminderAction = ((/(send|give|text|message).*(reminder|message|notification|it)/i.test(message) && /(again|now|right now|immediately|asap|today)/i.test(message)) ||
            /(send|text|message).*(her|him|them).*(reminder|again)/i.test(message) ||
            /(remind|text|message).*(her|him|them).*(now|again|please)/i.test(message));
        if (isReminderAction) {
            this.logger.log(`[SMART ACTION] Manual reminder request detected: "${message}"`);
            const recentBooking = await this.prisma.booking.findFirst({
                where: { customerId },
                orderBy: { createdAt: 'desc' },
                include: { customer: true }
            });
            if (recentBooking) {
                const bookingDt = luxon_1.DateTime.fromJSDate(recentBooking.dateTime).setZone(this.studioTz);
                const formattedDate = bookingDt.toFormat('MMMM d, yyyy');
                const formattedTime = bookingDt.toFormat('h:mm a');
                const recipientName = recentBooking.recipientName || recentBooking.customer?.name || 'there';
                const recipientPhone = recentBooking.recipientPhone || recentBooking.customer?.phone;
                if (recipientPhone) {
                    const reminderMessage = `Hi ${recipientName}! 💖\n\n` +
                        `This is a friendly reminder about your upcoming maternity photoshoot ` +
                        `on *${formattedDate} at ${formattedTime}*. ` +
                        `We're so excited to capture your beautiful moments! ✨📸\n\n` +
                        `If you have any questions, feel free to reach out. See you soon! 🌸`;
                    try {
                        await this.messagesService.sendOutboundMessage(recipientPhone, reminderMessage, 'whatsapp');
                        this.logger.log(`[SMART ACTION] Sent manual reminder to ${recipientPhone} for booking ${recentBooking.id}`);
                        const confirmMsg = `Done! ✅ I've just sent a lovely reminder to ${recipientName} at ${recipientPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}. She should receive it shortly. 💖`;
                        return { response: confirmMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: confirmMsg }] };
                    }
                    catch (err) {
                        this.logger.error('[SMART ACTION] Failed to send manual reminder', err);
                        const errorMsg = `I tried to send the reminder, but encountered an issue. Could you please check the phone number or try again? 💕`;
                        return { response: errorMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: errorMsg }] };
                    }
                }
                else {
                    const noPhoneMsg = `I'd love to send that reminder, but I don't have a phone number for ${recipientName}. Could you provide it? 🌸`;
                    return { response: noPhoneMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: noPhoneMsg }] };
                }
            }
            else {
                const noBookingMsg = `I'd be happy to send a reminder, but I don't see any booking details yet. Would you like to book a session first? 💖`;
                return { response: noBookingMsg, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: noBookingMsg }] };
            }
        }
        if (hasDraft && /(yes|yeah|yep|correct|that'?s? right|it is|yess)/i.test(message) && /(whatsapp|number|phone|reach)/i.test(lower)) {
            this.logger.log(`[SMART EXTRACTION] Detected WhatsApp number confirmation: "${message}"`);
            const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
            if (customer?.phone && !draft.recipientPhone) {
                await this.prisma.bookingDraft.update({
                    where: { customerId },
                    data: { recipientPhone: customer.phone }
                });
                this.logger.log(`[SMART EXTRACTION] Set recipientPhone to customer phone: ${customer.phone}`);
                draft = await this.prisma.bookingDraft.findUnique({ where: { customerId } });
            }
        }
        const businessNameKeywords = ['business name', 'what is the business called', 'who are you', 'company name', 'studio name', 'what is this place', 'what is this business', 'what is your name'];
        if (businessNameKeywords.some((kw) => lower.includes(kw))) {
            const nameResponse = `Our business is called ${this.businessName}. If you have any questions about our services or need assistance, I'm here to help! 😊`;
            const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: nameResponse }];
            return { response: nameResponse, draft: null, updatedHistory };
        }
        const locationQueryKeywords = ['location', 'where', 'address', 'located', 'studio location', 'studio address', 'where are you', 'where is the studio', 'studio address'];
        if (locationQueryKeywords.some((kw) => lower.includes(kw))) {
            const locationResponse = `Our business is called ${this.businessName}. ${this.businessLocation}`;
            const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: locationResponse }];
            return { response: locationResponse, draft: null, updatedHistory };
        }
        const websiteQueryKeywords = ['website', 'web address', 'url', 'online', 'site', 'web page', 'webpage'];
        if (websiteQueryKeywords.some((kw) => lower.includes(kw))) {
            const websiteResponse = `You can visit our website at ${this.businessWebsite} to learn more about our services and view our portfolio! 🌸✨`;
            const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: websiteResponse }];
            return { response: websiteResponse, draft: null, updatedHistory };
        }
        const customerCareKeywords = ['customer care', 'support', 'help line', 'call', 'phone number', 'contact number', 'telephone', 'mobile number', 'reach you'];
        if (customerCareKeywords.some((kw) => lower.includes(kw))) {
            const careResponse = `You can reach our customer care team at ${this.customerCarePhone}. We're here to help! 💖 You can also email us at ${this.customerCareEmail}.`;
            const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: careResponse }];
            return { response: careResponse, draft: null, updatedHistory };
        }
        const hoursQueryKeywords = ['hours', 'open', 'when are you open', 'operating hours', 'business hours', 'what time', 'opening hours', 'closing time', 'when do you close'];
        if (hoursQueryKeywords.some((kw) => lower.includes(kw))) {
            const hoursResponse = `We're open ${this.businessHours}. Feel free to visit us or book an appointment during these times! 🕐✨`;
            const updatedHistory = [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: hoursResponse }];
            return { response: hoursResponse, draft: null, updatedHistory };
        }
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
        const isBackdropImageRequest = /(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message);
        const isPackageQuery = !isBackdropImageRequest && /(package|price|pricing|cost|how much|offer|photoshoot|shoot|what do you have|what are|show me|tell me about)/i.test(message);
        if (isBackdropImageRequest) {
            this.logger.log(`[BACKDROP REQUEST DETECTED] Message: "${message}" - routing to FAQ flow`);
        }
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
                            ? result.updatedHistory.map((msg) => ({
                                ...msg,
                                content: typeof msg.content === 'object' && msg.content !== null && 'text' in msg.content ? msg.content.text : msg.content
                            }))
                            : undefined
                    };
                }
            }
        }
        let intent = 'other';
        if (/(backdrop|background|studio set|flower wall|portfolio|show.*(image|photo|picture|portfolio)|see.*(image|photo|picture|example))/i.test(message)) {
            intent = 'faq';
            this.logger.log('[INTENT] Classified as FAQ (backdrop/image request) - overriding draft check');
        }
        else if (hasDraft) {
            intent = 'booking';
        }
        else {
            if (/(book|appointment|reserve|schedule|slot|available|tomorrow|next)/.test(lower)) {
                intent = 'booking';
            }
            else if (/\?/.test(message) || /(price|cost|how much|hours|open|service)/.test(lower)) {
                intent = 'faq';
            }
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
        if (intent === 'booking' && hasDraft) {
            await this.prisma.bookingDraft.delete({ where: { customerId } });
            draft = null;
            hasDraft = false;
            this.logger.log(`[NEW BOOKING] Cancelled existing unpaid draft for customer ${customerId} when starting new booking`);
        }
        if (intent === 'faq' || intent === 'other') {
            const reply = await this.answerFaq(message, history, undefined, customerId, enrichedContext);
            const replyText = typeof reply === 'object' && 'text' in reply ? reply.text : reply;
            return { response: reply, draft: null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: replyText }] };
        }
        const bookingStrategy = this.strategies.find(s => s instanceof booking_strategy_1.BookingStrategy);
        if (bookingStrategy) {
            return bookingStrategy.generateResponse(message, { ...context, intent: 'booking' });
        }
        this.logger.log(`[INTENT] Defaulting to FAQ/General for message: "${message}"`);
        const faqResponse = await this.answerFaq(message, history, undefined, customerId);
        await this.trackConversationMetrics(customerId, {
            intent: 'faq',
            duration: 0,
            messagesCount: history.length + 1,
            resolved: true
        });
        return { response: faqResponse, draft: hasDraft ? draft : null, updatedHistory: [...history.slice(-this.historyLimit), { role: 'user', content: message }, { role: 'assistant', content: faqResponse }] };
    }
    async addKnowledge(question, answer, category = 'general') {
        try {
            const existing = await this.prisma.knowledgeBase.findFirst({
                where: { question },
            });
            if (existing) {
                await this.prisma.knowledgeBase.update({
                    where: { id: existing.id },
                    data: {
                        answer,
                        category,
                        embedding: await this.generateEmbedding(question + ' ' + answer),
                    },
                });
            }
            else {
                await this.prisma.knowledgeBase.create({
                    data: {
                        question,
                        answer,
                        category,
                        embedding: await this.generateEmbedding(question + ' ' + answer),
                    },
                });
            }
        }
        catch (err) {
            this.logger.error(`addKnowledge: Failed to save to DB: ${err.message}`, err);
            return;
        }
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
            if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
                prediction = result.response.text;
            }
            else if (typeof result.response === 'string') {
                prediction = result.response;
            }
            else {
                prediction = '';
            }
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
        if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
            return result.response.text;
        }
        else if (typeof result.response === 'string') {
            return result.response;
        }
        return '';
    }
    async generateGeneralResponse(message, customerId, bookingsService, history) {
        const result = await this.handleConversation(message, customerId, history || [], bookingsService);
        if (typeof result.response === 'object' && result.response !== null && 'text' in result.response) {
            return result.response.text;
        }
        else if (typeof result.response === 'string') {
            return result.response;
        }
        return '';
    }
    async handleConversationWithLearning(message, customerId, history = [], bookingsService, retryCount = 0, enrichedContext) {
        const conversationStartTime = Date.now();
        let personalizationContext = null;
        let intentAnalysis = null;
        let wasSuccessful = false;
        let conversationOutcome = 'unknown';
        try {
            if (this.customerMemory) {
                try {
                    personalizationContext = await this.customerMemory.getPersonalizationContext(customerId);
                    this.logger.debug(`[LEARNING] Context: ${personalizationContext.relationshipStage}, VIP: ${personalizationContext.isVIP}`);
                    enrichedContext = { ...enrichedContext, personalization: personalizationContext };
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Failed to load context', err);
                }
            }
            if (this.advancedIntent) {
                try {
                    intentAnalysis = await this.advancedIntent.analyzeIntent(message, personalizationContext);
                    this.logger.debug(`[LEARNING] Intent: ${intentAnalysis.primaryIntent} (${intentAnalysis.confidence}), Tone: ${intentAnalysis.emotionalTone}`);
                    if (intentAnalysis.requiresHumanHandoff && this.escalationService) {
                        await this.escalationService.createEscalation(customerId, 'AI detected need for human', 'auto_detected', { intentAnalysis, message });
                    }
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Intent analysis failed', err);
                }
            }
            if (history.length === 0 && this.personalization && personalizationContext) {
                try {
                    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
                    const greeting = await this.personalization.generateGreeting(customerId, customer?.name);
                    history = [{ role: 'assistant', content: greeting }];
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Greeting failed', err);
                }
            }
            const result = await this.handleConversation(message, customerId, history, bookingsService, retryCount, enrichedContext);
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
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Personalization failed', err);
                }
            }
            wasSuccessful = !result.response?.includes('trouble') && !result.response?.includes('error');
            if (result.draft && result.draft.step === 'confirm')
                conversationOutcome = 'booking_initiated';
            else if (intentAnalysis?.primaryIntent === 'booking')
                conversationOutcome = 'booking_in_progress';
            else if (intentAnalysis?.primaryIntent === 'package_inquiry')
                conversationOutcome = 'information_provided';
            else
                conversationOutcome = 'resolved';
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
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Failed to record', err);
                }
            }
            if (this.customerMemory && this.personalization) {
                try {
                    const preferences = this.personalization.extractPreferencesFromMessage(message);
                    if (Object.keys(preferences).length > 0) {
                        await this.customerMemory.updatePreferences(customerId, preferences);
                    }
                    if (conversationOutcome === 'booking_initiated' && personalizationContext.relationshipStage === 'new') {
                        await this.customerMemory.updateRelationshipStage(customerId, 'booked');
                    }
                    else if (conversationOutcome === 'information_provided' && personalizationContext.relationshipStage === 'new') {
                        await this.customerMemory.updateRelationshipStage(customerId, 'interested');
                    }
                    await this.customerMemory.addConversationSummary(customerId, {
                        date: new Date(),
                        intent: intentAnalysis?.primaryIntent || 'unknown',
                        outcome: conversationOutcome,
                        keyPoints: [message.substring(0, 100)],
                    });
                    if (history.length >= 3) {
                        const userMessages = history.filter((h) => h.role === 'user').map((h) => h.content);
                        const detectedStyle = this.customerMemory.detectCommunicationStyle(userMessages);
                        await this.customerMemory.updatePreferences(customerId, { communicationStyle: detectedStyle });
                    }
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Memory update failed', err);
                }
            }
            return result;
        }
        catch (error) {
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
                }
                catch (err) {
                    this.logger.warn('[LEARNING] Error recording failed', err);
                }
            }
            throw error;
        }
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => bookings_service_1.BookingsService))),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, bull_1.InjectQueue)('aiQueue')),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __param(10, (0, common_1.Optional)()),
    __param(11, (0, common_1.Optional)()),
    __param(12, (0, common_1.Optional)()),
    __param(13, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        circuit_breaker_service_1.CircuitBreakerService,
        bookings_service_1.BookingsService,
        messages_service_1.MessagesService,
        escalation_service_1.EscalationService, Object, customer_memory_service_1.CustomerMemoryService,
        conversation_learning_service_1.ConversationLearningService,
        domain_expertise_service_1.DomainExpertiseService,
        advanced_intent_service_1.AdvancedIntentService,
        personalization_service_1.PersonalizationService,
        feedback_loop_service_1.FeedbackLoopService,
        predictive_analytics_service_1.PredictiveAnalyticsService])
], AiService);
//# sourceMappingURL=ai.service.js.map