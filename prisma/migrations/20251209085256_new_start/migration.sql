/*
  Warnings:

  - You are about to drop the column `maternityPackage` on the `booking_drafts` table. All the data in the column will be lost.
  - You are about to drop the column `maternityPackage` on the `bookings` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[question]` on the table `knowledge_base` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `service` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `knowledge_base` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AiPrediction" ADD COLUMN     "tokensUsed" INTEGER,
ADD COLUMN     "wasCached" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "booking_drafts" DROP COLUMN "maternityPackage",
ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "conflictResolution" TEXT,
ADD COLUMN     "service" TEXT;

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "maternityPackage",
ADD COLUMN     "service" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "dailyTokenUsage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastInstagramMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastMessengerMessageAt" TIMESTAMP(3),
ADD COLUMN     "tokenResetDate" TIMESTAMP(3),
ADD COLUMN     "totalTokensUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "escalations" ADD COLUMN     "description" TEXT,
ADD COLUMN     "escalationType" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "sentimentScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "knowledge_base" ADD COLUMN     "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "bookingId" TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'image',
    "source" TEXT NOT NULL DEFAULT 'website',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_metrics" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "messagesCount" INTEGER NOT NULL,
    "resolved" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_links" (
    "id" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "photo_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "depositPaid" DOUBLE PRECISION NOT NULL,
    "balanceDue" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "pdfData" BYTEA,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_shoot_followups" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageContent" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_shoot_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_reminders" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageContent" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_memory" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "preferredPackages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "preferredTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communicationStyle" TEXT,
    "relationshipStage" TEXT NOT NULL DEFAULT 'new',
    "lifetimeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "satisfactionScore" DOUBLE PRECISION,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "averageResponseTime" INTEGER,
    "preferredChannel" TEXT,
    "lastInteractionSummary" TEXT,
    "conversationSummaries" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "keyInsights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_learning" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userMessage" TEXT NOT NULL,
    "aiResponse" TEXT NOT NULL,
    "extractedIntent" TEXT NOT NULL,
    "detectedEmotionalTone" TEXT,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT false,
    "userFeedbackScore" INTEGER,
    "conversationOutcome" TEXT,
    "shouldAddToKB" BOOLEAN NOT NULL DEFAULT false,
    "newKnowledgeExtracted" TEXT,
    "category" TEXT,
    "conversationLength" INTEGER NOT NULL DEFAULT 1,
    "timeToResolution" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_feedback" (
    "id" TEXT NOT NULL,
    "predictionId" INTEGER NOT NULL,
    "thumbsUp" BOOLEAN,
    "rating" INTEGER,
    "comment" TEXT,
    "wasHelpful" BOOLEAN,
    "wasAccurate" BOOLEAN,
    "wasEmpathetic" BOOLEAN,
    "improvementSuggestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_knowledge" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableIntents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "exampleQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exampleResponses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_context" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "currentIntent" TEXT,
    "conversationStage" TEXT,
    "topicsDiscussed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "questionsAsked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "packagesViewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasSuccessful" BOOLEAN,
    "outcome" TEXT,
    "fullContext" JSONB,

    CONSTRAINT "conversation_context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proactive_outreach" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "messageContent" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "campaignId" TEXT,
    "metadata" JSONB,
    "responseReceived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proactive_outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "targetCriteria" JSONB NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "triggerDelay" INTEGER,
    "maxSends" INTEGER NOT NULL DEFAULT 1,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_preferences" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidWeekends" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduling_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_slot_availability" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "bookingId" TEXT,
    "photographerId" TEXT,
    "studioLocation" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_slot_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unified_conversations" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryChannel" TEXT NOT NULL,
    "currentContext" JSONB,
    "conversationState" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "unified_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_preferences" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "preferredChannel" TEXT,
    "channelResponseRates" JSONB,
    "channelEngagementScores" JSONB,
    "lastChannelUsed" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_sessions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "aiConfidence" DOUBLE PRECISION NOT NULL,
    "conversationContext" JSONB,
    "suggestedActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolution" TEXT,
    "resolutionTime" INTEGER,
    "humanCorrections" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "qualityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handoff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assist_suggestions" (
    "id" TEXT NOT NULL,
    "handoffId" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "wasUsed" BOOLEAN NOT NULL DEFAULT false,
    "wasHelpful" BOOLEAN,
    "humanFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assist_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_sessions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "objectionType" TEXT NOT NULL,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "offeredDiscount" DOUBLE PRECISION,
    "offeredPaymentPlan" BOOLEAN NOT NULL DEFAULT false,
    "alternativePackage" TEXT,
    "outcome" TEXT,
    "finalPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "negotiation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sentiment_scores" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sentiment" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "messageId" TEXT,
    "conversationContext" JSONB,
    "triggeredAlert" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sentiment_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "churn_alerts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recoveryAction" TEXT,
    "recoveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "churn_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_forecasts" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "forecastAmount" DOUBLE PRECISION NOT NULL,
    "actualAmount" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_performance" (
    "id" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "bookingsCount" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "conversionRate" DOUBLE PRECISION NOT NULL,
    "avgSatisfaction" DOUBLE PRECISION,
    "trends" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_performance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_category_idx" ON "media_assets"("category");

-- CreateIndex
CREATE INDEX "media_assets_subcategory_idx" ON "media_assets"("subcategory");

-- CreateIndex
CREATE INDEX "conversation_metrics_customerId_idx" ON "conversation_metrics"("customerId");

-- CreateIndex
CREATE INDEX "conversation_metrics_timestamp_idx" ON "conversation_metrics"("timestamp");

-- CreateIndex
CREATE INDEX "conversation_metrics_intent_idx" ON "conversation_metrics"("intent");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_bookingId_key" ON "invoices"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_memory_customerId_key" ON "customer_memory"("customerId");

-- CreateIndex
CREATE INDEX "conversation_learning_customerId_idx" ON "conversation_learning"("customerId");

-- CreateIndex
CREATE INDEX "conversation_learning_wasSuccessful_idx" ON "conversation_learning"("wasSuccessful");

-- CreateIndex
CREATE INDEX "conversation_learning_shouldAddToKB_idx" ON "conversation_learning"("shouldAddToKB");

-- CreateIndex
CREATE INDEX "conversation_learning_extractedIntent_idx" ON "conversation_learning"("extractedIntent");

-- CreateIndex
CREATE UNIQUE INDEX "response_feedback_predictionId_key" ON "response_feedback"("predictionId");

-- CreateIndex
CREATE INDEX "domain_knowledge_category_idx" ON "domain_knowledge"("category");

-- CreateIndex
CREATE INDEX "domain_knowledge_isActive_idx" ON "domain_knowledge"("isActive");

-- CreateIndex
CREATE INDEX "domain_knowledge_priority_idx" ON "domain_knowledge"("priority");

-- CreateIndex
CREATE INDEX "conversation_context_customerId_idx" ON "conversation_context"("customerId");

-- CreateIndex
CREATE INDEX "conversation_context_sessionId_idx" ON "conversation_context"("sessionId");

-- CreateIndex
CREATE INDEX "conversation_context_lastActivityAt_idx" ON "conversation_context"("lastActivityAt");

-- CreateIndex
CREATE INDEX "proactive_outreach_customerId_idx" ON "proactive_outreach"("customerId");

-- CreateIndex
CREATE INDEX "proactive_outreach_status_idx" ON "proactive_outreach"("status");

-- CreateIndex
CREATE INDEX "proactive_outreach_scheduledFor_idx" ON "proactive_outreach"("scheduledFor");

-- CreateIndex
CREATE INDEX "proactive_outreach_type_idx" ON "proactive_outreach"("type");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_preferences_customerId_key" ON "scheduling_preferences"("customerId");

-- CreateIndex
CREATE INDEX "time_slot_availability_date_idx" ON "time_slot_availability"("date");

-- CreateIndex
CREATE INDEX "time_slot_availability_isAvailable_idx" ON "time_slot_availability"("isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "unified_conversations_sessionId_key" ON "unified_conversations"("sessionId");

-- CreateIndex
CREATE INDEX "unified_conversations_customerId_idx" ON "unified_conversations"("customerId");

-- CreateIndex
CREATE INDEX "unified_conversations_sessionId_idx" ON "unified_conversations"("sessionId");

-- CreateIndex
CREATE INDEX "unified_conversations_lastActivityAt_idx" ON "unified_conversations"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "channel_preferences_customerId_key" ON "channel_preferences"("customerId");

-- CreateIndex
CREATE INDEX "handoff_sessions_customerId_idx" ON "handoff_sessions"("customerId");

-- CreateIndex
CREATE INDEX "handoff_sessions_status_idx" ON "handoff_sessions"("status");

-- CreateIndex
CREATE INDEX "handoff_sessions_assignedTo_idx" ON "handoff_sessions"("assignedTo");

-- CreateIndex
CREATE INDEX "ai_assist_suggestions_handoffId_idx" ON "ai_assist_suggestions"("handoffId");

-- CreateIndex
CREATE INDEX "negotiation_sessions_customerId_idx" ON "negotiation_sessions"("customerId");

-- CreateIndex
CREATE INDEX "negotiation_sessions_outcome_idx" ON "negotiation_sessions"("outcome");

-- CreateIndex
CREATE INDEX "sentiment_scores_customerId_idx" ON "sentiment_scores"("customerId");

-- CreateIndex
CREATE INDEX "sentiment_scores_sentiment_idx" ON "sentiment_scores"("sentiment");

-- CreateIndex
CREATE INDEX "sentiment_scores_createdAt_idx" ON "sentiment_scores"("createdAt");

-- CreateIndex
CREATE INDEX "churn_alerts_customerId_idx" ON "churn_alerts"("customerId");

-- CreateIndex
CREATE INDEX "churn_alerts_riskLevel_idx" ON "churn_alerts"("riskLevel");

-- CreateIndex
CREATE INDEX "churn_alerts_recoveryStatus_idx" ON "churn_alerts"("recoveryStatus");

-- CreateIndex
CREATE INDEX "revenue_forecasts_month_idx" ON "revenue_forecasts"("month");

-- CreateIndex
CREATE INDEX "package_performance_packageName_idx" ON "package_performance"("packageName");

-- CreateIndex
CREATE INDEX "package_performance_periodStart_idx" ON "package_performance"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_base_question_key" ON "knowledge_base"("question");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_metrics" ADD CONSTRAINT "conversation_metrics_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_links" ADD CONSTRAINT "photo_links_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_shoot_followups" ADD CONSTRAINT "post_shoot_followups_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_memory" ADD CONSTRAINT "customer_memory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_learning" ADD CONSTRAINT "conversation_learning_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_feedback" ADD CONSTRAINT "response_feedback_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "AiPrediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proactive_outreach" ADD CONSTRAINT "proactive_outreach_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proactive_outreach" ADD CONSTRAINT "proactive_outreach_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "outreach_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_preferences" ADD CONSTRAINT "scheduling_preferences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unified_conversations" ADD CONSTRAINT "unified_conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_preferences" ADD CONSTRAINT "channel_preferences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoff_sessions" ADD CONSTRAINT "handoff_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assist_suggestions" ADD CONSTRAINT "ai_assist_suggestions_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "handoff_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_sessions" ADD CONSTRAINT "negotiation_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentiment_scores" ADD CONSTRAINT "sentiment_scores_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "churn_alerts" ADD CONSTRAINT "churn_alerts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
