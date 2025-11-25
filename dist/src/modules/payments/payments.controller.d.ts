import { PaymentsService } from './payments.service';
export declare class PaymentsController {
    private readonly paymentsService;
    private readonly logger;
    constructor(paymentsService: PaymentsService);
    handleCallback(body: any): Promise<{
        ResultCode: number;
        ResultDesc: string;
    }>;
}
