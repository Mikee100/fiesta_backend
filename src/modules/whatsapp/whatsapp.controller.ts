import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('messages')
  async getMessages(@Query('customerId') customerId?: string) {
    return this.whatsappService.getMessages(customerId);
  }

  @Get('conversations')
  async getConversations() {
    return this.whatsappService.getConversations();
  }

  @Get('settings')
  async getSettings() {
    return this.whatsappService.getSettings();
  }

  @Post('settings')
  async updateSettings(@Body() settings: any) {
    return this.whatsappService.updateSettings(settings);
  }

  @Post('test-connection')
  async testConnection() {
    return this.whatsappService.testConnection();
  }

  @Post('send')
  async sendMessage(@Body() data: { to: string; message: string }) {
    return this.whatsappService.sendMessage(data.to, data.message);
  }

  @Get('stats')
  async getStats() {
    return this.whatsappService.getWhatsAppStats();
  }
}
