import { WebhooksService } from './webhooks.service';
export declare class WebhooksController {
    private readonly webhooksService;
    constructor(webhooksService: WebhooksService);
    verifyWhatsApp(mode: string, challenge: string, token: string): string;
    handleWhatsApp(body: any): Promise<{
        status: string;
    }>;
    verifyInstagram(mode: string, challenge: string, token: string): string;
    handleInstagram(body: any): Promise<void>;
    handleMessenger(body: any): Promise<{
        status: string;
    }>;
    handleTelegram(body: any): Promise<void>;
    verifyFacebook(mode: string, challenge: string, token: string): string;
    testQueue(body: {
        customerId: string;
        message: string;
        platform: string;
    }): Promise<{
        success: boolean;
        error: string;
        jobId?: undefined;
        redisStatus?: undefined;
        message?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        jobId: import("bull").JobId;
        redisStatus: string;
        message: string;
        error?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        error: string;
        stack: string;
        jobId?: undefined;
        redisStatus?: undefined;
        message?: undefined;
    }>;
}
