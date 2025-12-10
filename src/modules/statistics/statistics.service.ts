
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { subDays, subWeeks, subMonths, subHours } from 'date-fns';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getActiveUsers() {
    const now = new Date();
    const daily = await this.prisma.customer.count({
      where: { updatedAt: { gte: subDays(now, 1) } },
    });
    const weekly = await this.prisma.customer.count({
      where: { updatedAt: { gte: subWeeks(now, 1) } },
    });
    const monthly = await this.prisma.customer.count({
      where: { updatedAt: { gte: subMonths(now, 1) } },
    });
    return { daily, weekly, monthly };
  }

  async getEngagedCustomers() {
    // Top 10 customers by messages and bookings
    const customers = await this.prisma.customer.findMany({
      take: 10,
      include: {
        messages: true,
        bookings: true,
      },
    });
    // Sort by combined engagement (messages + bookings)
    const sorted = customers
      .map(c => ({
        id: c.id,
        name: c.name,
        messages: c.messages.length,
        bookings: c.bookings.length,
        engagement: c.messages.length + c.bookings.length,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);
    return sorted;
  }

  async getPackagePopularity() {
    // Aggregate bookings by service (package name)
    const packages = await this.prisma.package.findMany();
    const bookingCounts = await this.prisma.booking.groupBy({
      by: ['service'],
      _count: { service: true },
    });
    // Map package names to booking counts
    return packages.map(pkg => {
      const found = bookingCounts.find(b => b.service === pkg.name);
      return {
        id: pkg.id,
        name: pkg.name,
        bookings: found?._count.service || 0,
      };
    });
  }

  /* ========================================
   * CUSTOMER EMOTIONS & SENTIMENT STATS
   * ======================================== */

  /**
   * Get comprehensive customer emotion statistics
   */
  async getCustomerEmotionsStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // Get all sentiment scores
    const sentimentScores = await this.prisma.sentimentScore.findMany({
      where,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Group by sentiment type
    const sentimentDistribution: Record<string, number> = {
      very_negative: 0,
      negative: 0,
      neutral: 0,
      positive: 0,
      very_positive: 0,
    };

    const emotionByHour: Record<number, { [key: string]: number }> = {};
    const emotionByDay: Record<string, { [key: string]: number }> = {};
    let totalScore = 0;
    let avgConfidence = 0;

    sentimentScores.forEach((score) => {
      // Distribution
      sentimentDistribution[score.sentiment] = 
        (sentimentDistribution[score.sentiment] || 0) + 1;

      // By hour
      const hour = score.createdAt.getHours();
      if (!emotionByHour[hour]) {
        emotionByHour[hour] = {
          very_negative: 0,
          negative: 0,
          neutral: 0,
          positive: 0,
          very_positive: 0,
        };
      }
      emotionByHour[hour][score.sentiment]++;

      // By day
      const day = score.createdAt.toISOString().slice(0, 10);
      if (!emotionByDay[day]) {
        emotionByDay[day] = {
          very_negative: 0,
          negative: 0,
          neutral: 0,
          positive: 0,
          very_positive: 0,
        };
      }
      emotionByDay[day][score.sentiment]++;

      totalScore += score.score;
      avgConfidence += score.confidence;
    });

    const total = sentimentScores.length;
    const avgSentimentScore = total > 0 ? totalScore / total : 0;
    avgConfidence = total > 0 ? avgConfidence / total : 0;

    // Get customers with most negative sentiment (need attention)
    const negativeSentimentCustomers = await this.prisma.sentimentScore.groupBy({
      by: ['customerId'],
      where: {
        ...where,
        sentiment: { in: ['very_negative', 'negative'] },
      },
      _count: { id: true },
      _avg: { score: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const customersWithDetails = await Promise.all(
      negativeSentimentCustomers.map(async (item) => {
        const customer = await this.prisma.customer.findUnique({
          where: { id: item.customerId },
          select: { id: true, name: true, email: true },
        });
        return {
          customer,
          negativeSentimentCount: item._count.id,
          avgNegativeScore: item._avg.score || 0,
        };
      })
    );

    // Recent emotional trends (last 7 days)
    const sevenDaysAgo = subDays(new Date(), 7);
    const recentTrends = await this.prisma.sentimentScore.findMany({
      where: { ...where, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: 'asc' },
    });

    const trendByDay: Record<string, number> = {};
    recentTrends.forEach((trend) => {
      const day = trend.createdAt.toISOString().slice(0, 10);
      if (!trendByDay[day]) trendByDay[day] = 0;
      trendByDay[day] += trend.score;
    });

    return {
      total,
      distribution: {
        very_negative: sentimentDistribution.very_negative,
        negative: sentimentDistribution.negative,
        neutral: sentimentDistribution.neutral,
        positive: sentimentDistribution.positive,
        very_positive: sentimentDistribution.very_positive,
        percentages: {
          very_negative: total > 0 ? (sentimentDistribution.very_negative / total) * 100 : 0,
          negative: total > 0 ? (sentimentDistribution.negative / total) * 100 : 0,
          neutral: total > 0 ? (sentimentDistribution.neutral / total) * 100 : 0,
          positive: total > 0 ? (sentimentDistribution.positive / total) * 100 : 0,
          very_positive: total > 0 ? (sentimentDistribution.very_positive / total) * 100 : 0,
        },
      },
      averageScore: avgSentimentScore,
      averageConfidence: avgConfidence,
      byHour: Object.entries(emotionByHour).map(([hour, counts]) => ({
        hour: Number(hour),
        ...counts,
      })),
      byDay: Object.entries(emotionByDay).map(([date, counts]) => ({
        date,
        ...counts,
        avgScore: Object.entries(counts).reduce((sum, [sentiment, count]) => {
          const scoreMap: Record<string, number> = {
            very_negative: -1,
            negative: -0.5,
            neutral: 0,
            positive: 0.5,
            very_positive: 1,
          };
          return sum + (scoreMap[sentiment] * count);
        }, 0) / Object.values(counts).reduce((a, b) => a + b, 0),
      })),
      customersNeedingAttention: customersWithDetails,
      recentTrends: Object.entries(trendByDay).map(([date, score]) => ({
        date,
        avgScore: score / recentTrends.filter(t => t.createdAt.toISOString().slice(0, 10) === date).length,
      })),
    };
  }

  /**
   * Get emotional tone distribution from conversation learning
   */
  async getEmotionalToneStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const learnings = await this.prisma.conversationLearning.findMany({
      where: {
        ...where,
        detectedEmotionalTone: { not: null },
      },
      select: {
        detectedEmotionalTone: true,
        wasSuccessful: true,
        conversationOutcome: true,
        createdAt: true,
      },
    });

    const toneDistribution: Record<string, number> = {};
    const toneSuccessRate: Record<string, { successful: number; total: number }> = {};
    const toneOutcomes: Record<string, Record<string, number>> = {};

    learnings.forEach((learning) => {
      const tone = learning.detectedEmotionalTone || 'unknown';
      
      // Distribution
      toneDistribution[tone] = (toneDistribution[tone] || 0) + 1;

      // Success rate
      if (!toneSuccessRate[tone]) {
        toneSuccessRate[tone] = { successful: 0, total: 0 };
      }
      toneSuccessRate[tone].total++;
      if (learning.wasSuccessful) {
        toneSuccessRate[tone].successful++;
      }

      // Outcomes
      if (!toneOutcomes[tone]) {
        toneOutcomes[tone] = {};
      }
      const outcome = learning.conversationOutcome || 'unknown';
      toneOutcomes[tone][outcome] = (toneOutcomes[tone][outcome] || 0) + 1;
    });

    return {
      total: learnings.length,
      distribution: toneDistribution,
      successRates: Object.entries(toneSuccessRate).map(([tone, data]) => ({
        tone,
        successRate: data.total > 0 ? (data.successful / data.total) * 100 : 0,
        successful: data.successful,
        total: data.total,
      })),
      outcomesByTone: toneOutcomes,
    };
  }

  /* ========================================
   * AI PERSONALIZED RESPONSE STATS
   * ======================================== */

  /**
   * Get statistics about AI personalized responses
   */
  async getPersonalizedResponseStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // Get conversation learnings that have emotional tone (indicating personalization was used)
    const personalizedConversations = await this.prisma.conversationLearning.findMany({
      where: {
        ...where,
        detectedEmotionalTone: { not: null },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            customerMemory: {
              select: {
                communicationStyle: true,
                relationshipStage: true,
              },
            },
          },
        },
      },
    });

    // Personalization effectiveness
    const personalizedSuccessRate = personalizedConversations.length > 0
      ? (personalizedConversations.filter(c => c.wasSuccessful).length / personalizedConversations.length) * 100
      : 0;

    // Personalization by communication style
    const byStyle: Record<string, { total: number; successful: number }> = {};
    personalizedConversations.forEach((conv) => {
      const style = conv.customer.customerMemory?.communicationStyle || 'unknown';
      if (!byStyle[style]) {
        byStyle[style] = { total: 0, successful: 0 };
      }
      byStyle[style].total++;
      if (conv.wasSuccessful) {
        byStyle[style].successful++;
      }
    });

    // Personalization by relationship stage
    const byStage: Record<string, { total: number; successful: number }> = {};
    personalizedConversations.forEach((conv) => {
      const stage = conv.customer.customerMemory?.relationshipStage || 'unknown';
      if (!byStage[stage]) {
        byStage[stage] = { total: 0, successful: 0 };
      }
      byStage[stage].total++;
      if (conv.wasSuccessful) {
        byStage[stage].successful++;
      }
    });

    // Average time to resolution for personalized conversations
    const avgTimeToResolution = personalizedConversations.length > 0
      ? personalizedConversations
          .filter(c => c.timeToResolution !== null)
          .reduce((sum, c) => sum + (c.timeToResolution || 0), 0) /
          personalizedConversations.filter(c => c.timeToResolution !== null).length
      : 0;

    // Outcome distribution
    const outcomeDistribution: Record<string, number> = {};
    personalizedConversations.forEach((conv) => {
      const outcome = conv.conversationOutcome || 'unknown';
      outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
    });

    // Emotional tone matching effectiveness
    const toneMatchingStats: Record<string, { total: number; successful: number }> = {};
    personalizedConversations.forEach((conv) => {
      const tone = conv.detectedEmotionalTone || 'unknown';
      if (!toneMatchingStats[tone]) {
        toneMatchingStats[tone] = { total: 0, successful: 0 };
      }
      toneMatchingStats[tone].total++;
      if (conv.wasSuccessful) {
        toneMatchingStats[tone].successful++;
      }
    });

    return {
      totalPersonalizedConversations: personalizedConversations.length,
      overallSuccessRate: personalizedSuccessRate,
      averageTimeToResolution: Math.round(avgTimeToResolution),
      byCommunicationStyle: Object.entries(byStyle).map(([style, data]) => ({
        style,
        total: data.total,
        successful: data.successful,
        successRate: data.total > 0 ? (data.successful / data.total) * 100 : 0,
      })),
      byRelationshipStage: Object.entries(byStage).map(([stage, data]) => ({
        stage,
        total: data.total,
        successful: data.successful,
        successRate: data.total > 0 ? (data.successful / data.total) * 100 : 0,
      })),
      byEmotionalTone: Object.entries(toneMatchingStats).map(([tone, data]) => ({
        tone,
        total: data.total,
        successful: data.successful,
        successRate: data.total > 0 ? (data.successful / data.total) * 100 : 0,
      })),
      outcomeDistribution,
      averageConversationLength: personalizedConversations.length > 0
        ? personalizedConversations.reduce((sum, c) => sum + c.conversationLength, 0) / personalizedConversations.length
        : 0,
    };
  }

  /* ========================================
   * AI PERFORMANCE STATS
   * ======================================== */

  /**
   * Get comprehensive AI performance metrics
   */
  async getAIPerformanceStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    // Get AI predictions
    const predictions = await this.prisma.aiPrediction.findMany({
      where,
      include: {
        feedback: true,
      },
    });

    // Response time statistics
    const responseTimes = predictions.map(p => p.responseTime);
    const sortedResponseTimes = [...responseTimes].sort((a, b) => a - b);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const p50ResponseTime = sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.5)] || 0;
    const p95ResponseTime = sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] || 0;
    const p99ResponseTime = sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0;

    // Confidence scores
    const confidences = predictions.filter(p => p.confidence !== null).map(p => p.confidence!);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // Error rate
    const errors = predictions.filter(p => p.error !== null);
    const errorRate = predictions.length > 0
      ? (errors.length / predictions.length) * 100
      : 0;

    // Cache hit rate
    const cached = predictions.filter(p => p.wasCached);
    const cacheHitRate = predictions.length > 0
      ? (cached.length / predictions.length) * 100
      : 0;

    // Token usage
    const tokensUsed = predictions
      .filter(p => p.tokensUsed !== null)
      .reduce((sum, p) => sum + (p.tokensUsed || 0), 0);
    const avgTokensPerRequest = predictions.filter(p => p.tokensUsed !== null).length > 0
      ? tokensUsed / predictions.filter(p => p.tokensUsed !== null).length
      : 0;

    // User feedback
    const feedbacks = predictions.filter(p => p.userFeedback !== null);
    const avgFeedback = feedbacks.length > 0
      ? feedbacks.reduce((sum, p) => sum + (p.userFeedback || 0), 0) / feedbacks.length
      : 0;

    // Detailed feedback analysis
    const detailedFeedbacks = predictions.filter(p => p.feedback !== null);
    const helpfulCount = detailedFeedbacks.filter(p => p.feedback?.wasHelpful === true).length;
    const accurateCount = detailedFeedbacks.filter(p => p.feedback?.wasAccurate === true).length;
    const empatheticCount = detailedFeedbacks.filter(p => p.feedback?.wasEmpathetic === true).length;
    const thumbsUpCount = detailedFeedbacks.filter(p => p.feedback?.thumbsUp === true).length;

    // Success rate from conversation learning
    const learningWhere: any = {};
    if (startDate || endDate) {
      learningWhere.createdAt = {};
      if (startDate) learningWhere.createdAt.gte = startDate;
      if (endDate) learningWhere.createdAt.lte = endDate;
    }
    const learnings = await this.prisma.conversationLearning.findMany({
      where: learningWhere,
    });
    const successRate = learnings.length > 0
      ? (learnings.filter(l => l.wasSuccessful).length / learnings.length) * 100
      : 0;

    // Performance by intent
    const intentPerformance: Record<string, { total: number; successful: number; avgTime: number }> = {};
    learnings.forEach((learning) => {
      const intent = learning.extractedIntent || 'unknown';
      if (!intentPerformance[intent]) {
        intentPerformance[intent] = { total: 0, successful: 0, avgTime: 0 };
      }
      intentPerformance[intent].total++;
      if (learning.wasSuccessful) {
        intentPerformance[intent].successful++;
      }
      if (learning.timeToResolution) {
        intentPerformance[intent].avgTime += learning.timeToResolution;
      }
    });

    Object.keys(intentPerformance).forEach((intent) => {
      const perf = intentPerformance[intent];
      perf.avgTime = perf.total > 0 ? perf.avgTime / perf.total : 0;
    });

    return {
      totalRequests: predictions.length,
      responseTime: {
        average: Math.round(avgResponseTime),
        p50: p50ResponseTime,
        p95: p95ResponseTime,
        p99: p99ResponseTime,
        min: sortedResponseTimes[0] || 0,
        max: sortedResponseTimes[sortedResponseTimes.length - 1] || 0,
      },
      accuracy: {
        averageConfidence: avgConfidence,
        errorRate,
        errorCount: errors.length,
        successRate,
      },
      efficiency: {
        cacheHitRate,
        cachedRequests: cached.length,
        averageTokensPerRequest: Math.round(avgTokensPerRequest),
        totalTokensUsed: tokensUsed,
      },
      userSatisfaction: {
        averageRating: avgFeedback,
        ratingsCount: feedbacks.length,
        helpfulRate: detailedFeedbacks.length > 0
          ? (helpfulCount / detailedFeedbacks.length) * 100
          : 0,
        accurateRate: detailedFeedbacks.length > 0
          ? (accurateCount / detailedFeedbacks.length) * 100
          : 0,
        empatheticRate: detailedFeedbacks.length > 0
          ? (empatheticCount / detailedFeedbacks.length) * 100
          : 0,
        thumbsUpRate: detailedFeedbacks.length > 0
          ? (thumbsUpCount / detailedFeedbacks.length) * 100
          : 0,
      },
      byIntent: Object.entries(intentPerformance).map(([intent, data]) => ({
        intent,
        total: data.total,
        successful: data.successful,
        successRate: data.total > 0 ? (data.successful / data.total) * 100 : 0,
        averageTimeToResolution: Math.round(data.avgTime),
      })),
      modelVersions: (() => {
        const versions: Record<string, number> = {};
        predictions.forEach(p => {
          const version = p.modelVersion || 'unknown';
          versions[version] = (versions[version] || 0) + 1;
        });
        return versions;
      })(),
    };
  }

  /* ========================================
   * SYSTEM-WIDE STATS
   * ======================================== */

  /**
   * Get comprehensive system-wide statistics
   */
  async getSystemStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    const messageWhere: any = {};
    const bookingWhere: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      messageWhere.createdAt = {};
      bookingWhere.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
        messageWhere.createdAt.gte = startDate;
        bookingWhere.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
        messageWhere.createdAt.lte = endDate;
        bookingWhere.createdAt.lte = endDate;
      }
    }

    // Customers
    const [
      totalCustomers,
      activeCustomers,
      customersWithBookings,
      newCustomers,
      aiEnabledCustomers,
    ] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({
        where: {
          messages: {
            some: {
              createdAt: {
                gte: subDays(new Date(), 30),
              },
            },
          },
        },
      }),
      this.prisma.customer.count({
        where: { bookings: { some: {} } },
      }),
      this.prisma.customer.count({
        where: where.createdAt ? where : { createdAt: { gte: subDays(new Date(), 30) } },
      }),
      this.prisma.customer.count({
        where: { aiEnabled: true },
      }),
    ]);

    // Messages
    const [
      totalMessages,
      inboundMessages,
      outboundMessages,
      messagesByPlatform,
    ] = await Promise.all([
      this.prisma.message.count(),
      this.prisma.message.count({
        where: { ...messageWhere, direction: 'inbound' },
      }),
      this.prisma.message.count({
        where: { ...messageWhere, direction: 'outbound' },
      }),
      this.prisma.message.groupBy({
        by: ['platform'],
        where: messageWhere,
        _count: { id: true },
      }),
    ]);

    // Bookings
    const [
      totalBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      bookingsByStatus,
    ] = await Promise.all([
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: { ...bookingWhere, status: 'confirmed' },
      }),
      this.prisma.booking.count({
        where: { ...bookingWhere, status: 'completed' },
      }),
      this.prisma.booking.count({
        where: { ...bookingWhere, status: 'cancelled' },
      }),
      this.prisma.booking.groupBy({
        by: ['status'],
        where: bookingWhere,
        _count: { id: true },
      }),
    ]);

    // Escalations
    const [
      totalEscalations,
      openEscalations,
      resolvedEscalations,
      escalationsByType,
    ] = await Promise.all([
      this.prisma.escalation.count(),
      this.prisma.escalation.count({
        where: { status: 'OPEN' },
      }),
      this.prisma.escalation.count({
        where: { status: 'RESOLVED' },
      }),
      this.prisma.escalation.groupBy({
        by: ['escalationType'],
        _count: { id: true },
      }),
    ]);

    // Payments
    const paymentResult = await this.prisma.payment.aggregate({
      where: {
        status: 'success',
        ...(bookingWhere.createdAt ? { createdAt: bookingWhere.createdAt } : {}),
      },
      _sum: { amount: true },
      _count: true,
    });

    // Churn alerts
    const [
      totalChurnAlerts,
      activeChurnAlerts,
      churnAlertsByRiskLevel,
    ] = await Promise.all([
      this.prisma.churnAlert.count(),
      this.prisma.churnAlert.count({
        where: { recoveryStatus: { in: ['pending', 'in_progress'] } },
      }),
      this.prisma.churnAlert.groupBy({
        by: ['riskLevel'],
        _count: { id: true },
      }),
    ]);

    // AI predictions
    const predictionWhere: any = {};
    if (startDate || endDate) {
      predictionWhere.timestamp = {};
      if (startDate) predictionWhere.timestamp.gte = startDate;
      if (endDate) predictionWhere.timestamp.lte = endDate;
    }
    const totalAIPredictions = await this.prisma.aiPrediction.count({
      where: predictionWhere,
    });

    // Conversation metrics
    const conversationWhere: any = {};
    if (startDate || endDate) {
      conversationWhere.timestamp = {};
      if (startDate) conversationWhere.timestamp.gte = startDate;
      if (endDate) conversationWhere.timestamp.lte = endDate;
    }
    const conversationMetrics = await this.prisma.conversationMetrics.findMany({
      where: conversationWhere,
    });

    const avgConversationDuration = conversationMetrics.length > 0
      ? conversationMetrics.reduce((sum, m) => sum + m.duration, 0) / conversationMetrics.length
      : 0;

    const avgMessagesPerConversation = conversationMetrics.length > 0
      ? conversationMetrics.reduce((sum, m) => sum + m.messagesCount, 0) / conversationMetrics.length
      : 0;

    const resolutionRate = conversationMetrics.length > 0
      ? (conversationMetrics.filter(m => m.resolved).length / conversationMetrics.length) * 100
      : 0;

    return {
      customers: {
        total: totalCustomers,
        active: activeCustomers,
        withBookings: customersWithBookings,
        new: newCustomers,
        aiEnabled: aiEnabledCustomers,
        conversionRate: totalCustomers > 0
          ? (customersWithBookings / totalCustomers) * 100
          : 0,
      },
      messages: {
        total: totalMessages,
        inbound: inboundMessages,
        outbound: outboundMessages,
        byPlatform: messagesByPlatform.map(p => ({
          platform: p.platform,
          count: p._count.id,
        })),
        responseRate: inboundMessages > 0
          ? (outboundMessages / inboundMessages) * 100
          : 0,
      },
      bookings: {
        total: totalBookings,
        confirmed: confirmedBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        byStatus: bookingsByStatus.map(s => ({
          status: s.status,
          count: s._count.id,
        })),
        completionRate: totalBookings > 0
          ? ((completedBookings / totalBookings) * 100)
          : 0,
      },
      revenue: {
        total: paymentResult._sum.amount ? Number(paymentResult._sum.amount) : 0,
        transactionCount: paymentResult._count,
        averageTransaction: paymentResult._count > 0
          ? Number(paymentResult._sum.amount || 0) / paymentResult._count
          : 0,
      },
      escalations: {
        total: totalEscalations,
        open: openEscalations,
        resolved: resolvedEscalations,
        byType: escalationsByType.map(e => ({
          type: e.escalationType,
          count: e._count.id,
        })),
        resolutionRate: totalEscalations > 0
          ? (resolvedEscalations / totalEscalations) * 100
          : 0,
      },
      churnAlerts: {
        total: totalChurnAlerts,
        active: activeChurnAlerts,
        byRiskLevel: churnAlertsByRiskLevel.map(c => ({
          riskLevel: c.riskLevel,
          count: c._count.id,
        })),
      },
      ai: {
        totalPredictions: totalAIPredictions,
        predictionsPerCustomer: totalCustomers > 0
          ? totalAIPredictions / totalCustomers
          : 0,
      },
      conversations: {
        total: conversationMetrics.length,
        averageDuration: Math.round(avgConversationDuration),
        averageMessagesPerConversation: Math.round(avgMessagesPerConversation),
        resolutionRate,
      },
      period: {
        start: startDate || subDays(new Date(), 30),
        end: endDate || new Date(),
      },
    };
  }

  /* ========================================
   * COMPREHENSIVE STATS ENDPOINT
   * ======================================== */

  /**
   * Get all comprehensive statistics in one call
   */
  async getComprehensiveStats(startDate?: Date, endDate?: Date) {
    const [
      systemStats,
      customerEmotions,
      emotionalTones,
      personalizedResponses,
      aiPerformance,
    ] = await Promise.all([
      this.getSystemStats(startDate, endDate),
      this.getCustomerEmotionsStats(startDate, endDate),
      this.getEmotionalToneStats(startDate, endDate),
      this.getPersonalizedResponseStats(startDate, endDate),
      this.getAIPerformanceStats(startDate, endDate),
    ]);

    return {
      system: systemStats,
      customerEmotions,
      emotionalTones,
      personalizedResponses,
      aiPerformance,
      generatedAt: new Date().toISOString(),
    };
  }
}
