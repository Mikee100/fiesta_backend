import { ResponseStrategy } from './response-strategy.interface';
export declare class FaqStrategy implements ResponseStrategy {
    readonly priority = 100;
    canHandle(intent: string, context: any): boolean;
    generateResponse(message: string, context: any): Promise<any>;
    private checkForExternalPeopleOrItems;
}
