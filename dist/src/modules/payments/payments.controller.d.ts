import { PaymentsService } from './payments.service';
export declare class PaymentsController {
    private readonly paymentsService;
    private readonly logger;
    constructor(paymentsService: PaymentsService);
    getPaymentStatus(checkoutRequestId: string): Promise<{
        status: string;
        payment?: undefined;
    } | {
        status: string;
        payment: {
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            phone: string;
            bookingId: string | null;
            amount: number;
            bookingDraftId: string | null;
            mpesaReceipt: string | null;
            checkoutRequestId: string | null;
        };
    }>;
    handleCallback(body: any): Promise<{
        ResultCode: number;
        ResultDesc: string;
    }>;
    getCallbackHealth(): {
        status: string;
        message: string;
    };
    testStkPush(body: {
        phone: string;
        amount: number;
    }): Promise<{
        checkoutRequestId: any;
        merchantRequestId: any;
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    }>;
    handleWebhook(body: {
        checkoutRequestId: string;
        status: string;
    }): Promise<{
        status: string;
        message: string;
    } | {
        status: string;
        message?: undefined;
    }>;
}
