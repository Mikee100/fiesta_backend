import { MessengerService } from './messenger.service';
import { Request, Response } from 'express';
export declare class MessengerController {
    private readonly messengerService;
    private readonly logger;
    constructor(messengerService: MessengerService);
    verifyWebhook(mode: string, token: string, challenge: string, res: Response): Promise<Response<any, Record<string, any>>>;
    handleMessage(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
