export interface ResponseStrategy {
    readonly priority?: number;
    canHandle(intent: string, context: any): boolean;
    generateResponse(message: string, context: any): Promise<any>;
}
