// src/modules/ai/dto/activate-learning.dto.ts
export class ActivateLearningDto {
    enabled: boolean;
}

export class FeedbackDto {
    predictionId: number;
    thumbsUp?: boolean;
    rating?: number;
    comment?: string;
    wasHelpful?: boolean;
    wasAccurate?: boolean;
    wasEmpathetic?: boolean;
}
