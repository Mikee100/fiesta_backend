import { PrismaService } from '../../prisma/prisma.service';
export declare class StatisticsService {
    private prisma;
    constructor(prisma: PrismaService);
    getActiveUsers(): Promise<{
        daily: number;
        weekly: number;
        monthly: number;
    }>;
    getEngagedCustomers(): Promise<{
        id: string;
        name: string;
        messages: number;
        bookings: number;
        engagement: number;
    }[]>;
    getPackagePopularity(): Promise<{
        id: string;
        name: string;
        bookings: number;
    }[]>;
    getCustomerEmotionsStats(startDate?: Date, endDate?: Date): Promise<{
        total: number;
        distribution: {
            very_negative: number;
            negative: number;
            neutral: number;
            positive: number;
            very_positive: number;
            percentages: {
                very_negative: number;
                negative: number;
                neutral: number;
                positive: number;
                very_positive: number;
            };
        };
        averageScore: number;
        averageConfidence: number;
        byHour: {
            hour: number;
        }[];
        byDay: {
            avgScore: number;
            date: string;
        }[];
        customersNeedingAttention: {
            customer: {
                id: string;
                name: string;
                email: string;
            };
            negativeSentimentCount: number;
            avgNegativeScore: number;
        }[];
        recentTrends: {
            date: string;
            avgScore: number;
        }[];
    }>;
    getEmotionalToneStats(startDate?: Date, endDate?: Date): Promise<{
        total: number;
        distribution: Record<string, number>;
        successRates: {
            tone: string;
            successRate: number;
            successful: number;
            total: number;
        }[];
        outcomesByTone: Record<string, Record<string, number>>;
    }>;
    getPersonalizedResponseStats(startDate?: Date, endDate?: Date): Promise<{
        totalPersonalizedConversations: number;
        overallSuccessRate: number;
        averageTimeToResolution: number;
        byCommunicationStyle: {
            style: string;
            total: number;
            successful: number;
            successRate: number;
        }[];
        byRelationshipStage: {
            stage: string;
            total: number;
            successful: number;
            successRate: number;
        }[];
        byEmotionalTone: {
            tone: string;
            total: number;
            successful: number;
            successRate: number;
        }[];
        outcomeDistribution: Record<string, number>;
        averageConversationLength: number;
    }>;
    getAIPerformanceStats(startDate?: Date, endDate?: Date): Promise<{
        totalRequests: number;
        responseTime: {
            average: number;
            p50: number;
            p95: number;
            p99: number;
            min: number;
            max: number;
        };
        accuracy: {
            averageConfidence: number;
            errorRate: number;
            errorCount: number;
            successRate: number;
        };
        efficiency: {
            cacheHitRate: number;
            cachedRequests: number;
            averageTokensPerRequest: number;
            totalTokensUsed: number;
        };
        userSatisfaction: {
            averageRating: number;
            ratingsCount: number;
            helpfulRate: number;
            accurateRate: number;
            empatheticRate: number;
            thumbsUpRate: number;
        };
        byIntent: {
            intent: string;
            total: number;
            successful: number;
            successRate: number;
            averageTimeToResolution: number;
        }[];
        modelVersions: Record<string, number>;
    }>;
    getSystemStats(startDate?: Date, endDate?: Date): Promise<{
        customers: {
            total: number;
            active: number;
            withBookings: number;
            new: number;
            aiEnabled: number;
            conversionRate: number;
        };
        messages: {
            total: number;
            inbound: number;
            outbound: number;
            byPlatform: {
                platform: string;
                count: number;
            }[];
            responseRate: number;
        };
        bookings: {
            total: number;
            confirmed: number;
            completed: number;
            cancelled: number;
            byStatus: {
                status: string;
                count: number;
            }[];
            completionRate: number;
        };
        revenue: {
            total: number;
            transactionCount: number;
            averageTransaction: number;
        };
        escalations: {
            total: number;
            open: number;
            resolved: number;
            byType: {
                type: string;
                count: number;
            }[];
            resolutionRate: number;
        };
        churnAlerts: {
            total: number;
            active: number;
            byRiskLevel: {
                riskLevel: string;
                count: number;
            }[];
        };
        ai: {
            totalPredictions: number;
            predictionsPerCustomer: number;
        };
        conversations: {
            total: number;
            averageDuration: number;
            averageMessagesPerConversation: number;
            resolutionRate: number;
        };
        period: {
            start: Date;
            end: Date;
        };
    }>;
    getComprehensiveStats(startDate?: Date, endDate?: Date): Promise<{
        system: {
            customers: {
                total: number;
                active: number;
                withBookings: number;
                new: number;
                aiEnabled: number;
                conversionRate: number;
            };
            messages: {
                total: number;
                inbound: number;
                outbound: number;
                byPlatform: {
                    platform: string;
                    count: number;
                }[];
                responseRate: number;
            };
            bookings: {
                total: number;
                confirmed: number;
                completed: number;
                cancelled: number;
                byStatus: {
                    status: string;
                    count: number;
                }[];
                completionRate: number;
            };
            revenue: {
                total: number;
                transactionCount: number;
                averageTransaction: number;
            };
            escalations: {
                total: number;
                open: number;
                resolved: number;
                byType: {
                    type: string;
                    count: number;
                }[];
                resolutionRate: number;
            };
            churnAlerts: {
                total: number;
                active: number;
                byRiskLevel: {
                    riskLevel: string;
                    count: number;
                }[];
            };
            ai: {
                totalPredictions: number;
                predictionsPerCustomer: number;
            };
            conversations: {
                total: number;
                averageDuration: number;
                averageMessagesPerConversation: number;
                resolutionRate: number;
            };
            period: {
                start: Date;
                end: Date;
            };
        };
        customerEmotions: {
            total: number;
            distribution: {
                very_negative: number;
                negative: number;
                neutral: number;
                positive: number;
                very_positive: number;
                percentages: {
                    very_negative: number;
                    negative: number;
                    neutral: number;
                    positive: number;
                    very_positive: number;
                };
            };
            averageScore: number;
            averageConfidence: number;
            byHour: {
                hour: number;
            }[];
            byDay: {
                avgScore: number;
                date: string;
            }[];
            customersNeedingAttention: {
                customer: {
                    id: string;
                    name: string;
                    email: string;
                };
                negativeSentimentCount: number;
                avgNegativeScore: number;
            }[];
            recentTrends: {
                date: string;
                avgScore: number;
            }[];
        };
        emotionalTones: {
            total: number;
            distribution: Record<string, number>;
            successRates: {
                tone: string;
                successRate: number;
                successful: number;
                total: number;
            }[];
            outcomesByTone: Record<string, Record<string, number>>;
        };
        personalizedResponses: {
            totalPersonalizedConversations: number;
            overallSuccessRate: number;
            averageTimeToResolution: number;
            byCommunicationStyle: {
                style: string;
                total: number;
                successful: number;
                successRate: number;
            }[];
            byRelationshipStage: {
                stage: string;
                total: number;
                successful: number;
                successRate: number;
            }[];
            byEmotionalTone: {
                tone: string;
                total: number;
                successful: number;
                successRate: number;
            }[];
            outcomeDistribution: Record<string, number>;
            averageConversationLength: number;
        };
        aiPerformance: {
            totalRequests: number;
            responseTime: {
                average: number;
                p50: number;
                p95: number;
                p99: number;
                min: number;
                max: number;
            };
            accuracy: {
                averageConfidence: number;
                errorRate: number;
                errorCount: number;
                successRate: number;
            };
            efficiency: {
                cacheHitRate: number;
                cachedRequests: number;
                averageTokensPerRequest: number;
                totalTokensUsed: number;
            };
            userSatisfaction: {
                averageRating: number;
                ratingsCount: number;
                helpfulRate: number;
                accurateRate: number;
                empatheticRate: number;
                thumbsUpRate: number;
            };
            byIntent: {
                intent: string;
                total: number;
                successful: number;
                successRate: number;
                averageTimeToResolution: number;
            }[];
            modelVersions: Record<string, number>;
        };
        generatedAt: string;
    }>;
}
