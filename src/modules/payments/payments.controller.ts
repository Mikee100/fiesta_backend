import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('mpesa')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // === M-PESA CALLBACK URL ===
  @Post('callback')
  async handleCallback(@Body() body: any) {
    this.logger.log('✅ M-Pesa callback received:', JSON.stringify(body));
    
    await this.paymentsService.handleCallback(body);

    // This response MUST be returned so M-Pesa stops re-sending callbacks
    return { 
      ResultCode: 0,
      ResultDesc: 'Accepted'
    };
  }
}
