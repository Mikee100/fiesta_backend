import { Controller, Get, Post, Query, Req, Res, Logger, HttpStatus } from '@nestjs/common';
import { MessengerService } from './messenger.service';
import { Request, Response } from 'express';

@Controller('webhooks/messenger')
export class MessengerController {
  private readonly logger = new Logger(MessengerController.name);

  constructor(private readonly messengerService: MessengerService) {}

  @Get()
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    this.logger.log(`Received GET webhook verification: mode=${mode}, token=${token}, challenge=${challenge}`);
    const verified = this.messengerService.verifyWebhook(mode, token, challenge);
    if (verified) {
      this.logger.log('Webhook verified successfully.');
      return res.status(HttpStatus.OK).send(challenge);
    } else {
      this.logger.warn('Webhook verification failed.');
      return res.status(HttpStatus.FORBIDDEN).send('Verification failed');
    }
  }

  @Post()
  async handleMessage(@Req() req: Request, @Res() res: Response) {
    this.logger.log('Received POST webhook event.');
    await this.messengerService.handleMessage(req.body);
    return res.status(HttpStatus.OK).json({ status: 'ok' });
  }
}
