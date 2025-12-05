import { Controller, Get, Post, Body, Query, Param, HttpException, HttpStatus } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { InstagramStatsService } from './instagram-stats.service';

@Controller('instagram')
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly instagramStatsService: InstagramStatsService,
  ) { }

  @Get('settings')
  getSettings() {
    return this.instagramService.getSettings();
  }

  @Post('settings')
  updateSettings(@Body() settings: any) {
    return this.instagramService.updateSettings(settings);
  }

  @Post('test-connection')
  testConnection() {
    return this.instagramService.testConnection();
  }

  @Get('can-send/:instagramId')
  async canSendMessage(@Param('instagramId') instagramId: string) {
    return this.instagramService.canSendMessage(instagramId);
  }

  @Post('send')
  async sendMessage(@Body() body: { to: string; message: string }) {
    console.log('📤 Controller: sendMessage called with body:', body);
    try {
      return await this.instagramService.sendMessage(body.to, body.message);
    } catch (error) {
      throw new HttpException(
        {
          message: error.message,
          suggestion: 'Instagram only allows replies within 24 hours of a user\'s message. The user must message you first before you can respond.'
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('messages')
  getMessages(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('direction') direction?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.instagramService.getMessages({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      direction: direction as 'inbound' | 'outbound',
      customerId,
    });
  }

  @Get('conversations')
  getConversations() {
    return this.instagramService.getConversations();
  }

  // Analytics endpoints
  @Get('stats')
  async getStats() {
    return this.instagramStatsService.getStats();
  }

  @Get('analytics/conversations')
  async getAnalyticsConversations() {
    return this.instagramStatsService.getConversations();
  }
}
