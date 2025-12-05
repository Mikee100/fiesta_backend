export declare class ActivateLearningDto {
    enabled: boolean;
}
export declare class FeedbackDto {
    predictionId: number;
    thumbsUp?: boolean;
    rating?: number;
    comment?: string;
    wasHelpful?: boolean;
    wasAccurate?: boolean;
    wasEmpathetic?: boolean;
}
