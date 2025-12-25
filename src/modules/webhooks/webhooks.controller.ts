import { Controller, Post, Body, Get, Query, HttpStatus, HttpException, UsePipes } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { WebhooksService } from './webhooks.service';
import { WebhookValidationPipe } from '../../common/pipes/webhook-validation.pipe';

@Controller('webhooks')
@SkipThrottle() // Webhooks should not be rate limited
@UsePipes(WebhookValidationPipe) // Bypass global ValidationPipe for all webhook routes
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) { }

  @Get('whatsapp')
  verifyWhatsApp(@Query('hub.mode') mode: string, @Query('hub.challenge') challenge: string, @Query('hub.verify_token') token: string) {
    console.log('[Webhook] Verifying WhatsApp:', { mode, token, expected: process.env.WHATSAPP_VERIFY_TOKEN });
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[Webhook] Verification successful!');
      return challenge;
    }
    console.log('[Webhook] Verification failed!');
    return 'ERROR';
  }

  /**
   * WhatsApp webhook endpoint - PRODUCTION MODE
   * Accepts webhooks from Meta for ALL phone numbers
   * No phone number restrictions - all messages are processed
   */
  @Post('whatsapp')
  async handleWhatsApp(@Body() body: any) {

    try {
      return await this.webhooksService.handleWhatsAppWebhook(body);
    } catch (error) {
      console.error('[WEBHOOK CONTROLLER] Error handling webhook:', error);
      throw error;
    }
  }

  @Get('instagram')
  verifyInstagram(@Query('hub.mode') mode: string, @Query('hub.challenge') challenge: string, @Query('hub.verify_token') token: string) {
    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
      return challenge;
    }
    return 'ERROR';
  }

  @Post('instagram')
  async handleInstagram(@Body() body: any) {
    console.log('[WEBHOOK] Instagram webhook received');
    try {
      const result = await this.webhooksService.handleInstagramWebhook(body);
      console.log('[WEBHOOK] Instagram webhook processed successfully');
      return result;
    } catch (error) {
      console.error('[WEBHOOK CONTROLLER] Error handling Instagram webhook:', error);
      console.error('[WEBHOOK CONTROLLER] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  @Post('messenger')
  async handleMessenger(@Body() body: any) {
    return await this.webhooksService.handleMessengerWebhook(body);
  }
  @Post('telegram')
  async handleTelegram(@Body() body: any) {
    return await this.webhooksService.handleTelegramWebhook(body);
  }

  @Get('facebook')
  verifyFacebook(@Query('hub.mode') mode: string, @Query('hub.challenge') challenge: string, @Query('hub.verify_token') token: string) {
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      return challenge; // Facebook expects plain text of the challenge
    }
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
  }

  /**
   * Test endpoint to manually trigger AI queue processing
   * Usage: POST /webhooks/test-queue with { customerId: "...", message: "hello", platform: "whatsapp" }
   */
  @Post('test-queue')
  async testQueue(@Body() body: { customerId: string; message: string; platform: string }) {
    console.log('[TEST] Testing queue with data:', body);
    return await this.webhooksService.testQueueConnection(body);
  }
}
