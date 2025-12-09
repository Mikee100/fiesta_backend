export interface ResponseStrategy {
    /**
     * Priority determines execution order (higher = runs first)
     * Default priority is 0 if not specified
     */
    readonly priority?: number;
    
    canHandle(intent: string, context: any): boolean;
    generateResponse(message: string, context: any): Promise<any>;
}
