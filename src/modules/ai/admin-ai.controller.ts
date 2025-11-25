import { Controller, Post, Body } from '@nestjs/common';
import { AiSettingsService } from './ai-settings.service';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';

@Controller('admin/ai')
export class AdminAiController {
  constructor(
    private aiSettingsService: AiSettingsService,
    private messagesService: MessagesService,
    private customersService: CustomersService,
  ) {}

  @Post('toggle')
  async toggleAi(@Body('enabled') enabled: boolean) {
    const result = await this.aiSettingsService.setAiEnabled(enabled);
    return { success: true, aiEnabled: result.aiEnabled };
  }

  @Post('send-reminder')
  async sendManualReminder(@Body() body: { customerId: string; bookingId?: string; message: string }) {
    const { customerId, bookingId, message } = body;

    const customer = await this.customersService.findOne(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Send via messenger if available, else whatsapp or instagram
    let platform = 'messenger';
    if (!customer.messengerId) {
      if (customer.whatsappId) {
        platform = 'whatsapp';
      } else if (customer.instagramId) {
        platform = 'instagram';
      } else {
        throw new Error('No platform ID available for customer');
      }
    }

    await this.messagesService.sendOutboundMessage(customerId, message, platform);

    return { success: true };
  }
}
