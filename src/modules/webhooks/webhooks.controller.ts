import { Controller, Post, Body, Get, Query, HttpStatus, HttpException } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('whatsapp')
  verifyWhatsApp(@Query('hub.mode') mode: string, @Query('hub.challenge') challenge: string, @Query('hub.verify_token') token: string) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return challenge;
    }
    return 'ERROR';
  }

  @Post('whatsapp')
  handleWhatsApp(@Body() body: any) {
    
    return this.webhooksService.handleWhatsAppWebhook(body);
  }

  @Get('instagram')
  verifyInstagram(@Query('hub.mode') mode: string, @Query('hub.challenge') challenge: string, @Query('hub.verify_token') token: string) {
    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
      return challenge;
    }
    return 'ERROR';
  }

  @Post('instagram')
  handleInstagram(@Body() body: any) {
    return this.webhooksService.handleInstagramWebhook(body);
  }

  @Post('messenger')
  handleMessenger(@Body() body: any) {
    return this.webhooksService.handleMessengerWebhook(body);
  }
  @Post('telegram')
  handleTelegram(@Body() body: any) {
    return this.webhooksService.handleTelegramWebhook(body);
  }

    @Get('facebook')
verifyFacebook(@Query('hub.mode') mode: string, @Query('hub.challenge') challenge: string, @Query('hub.verify_token') token: string) {
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    return challenge; // Facebook expects plain text of the challenge
  }
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}
}
