import { ResponseStrategy } from './response-strategy.interface';
export declare class BookingStrategy implements ResponseStrategy {
    readonly priority = 10;
    canHandle(intent: string, context: any): boolean;
    generateResponse(message: string, context: any): Promise<any>;
}
