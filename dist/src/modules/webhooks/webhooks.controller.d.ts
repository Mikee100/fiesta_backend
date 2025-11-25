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
    handleMessenger(body: any): Promise<void>;
    handleTelegram(body: any): Promise<void>;
    verifyFacebook(mode: string, challenge: string, token: string): string;
}
