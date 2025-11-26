import { getQueueToken } from '@nestjs/bull';
import { INestApplication } from '@nestjs/common';

export function setupBullBoard(app: INestApplication) {
  // Use require to avoid TypeScript/ESM issues
  const { BullAdapter, setQueues, router } = require('bull-board');

  // Get the aiQueue instance from NestJS DI
  const aiQueue = app.get(getQueueToken('aiQueue'));
  setQueues([new BullAdapter(aiQueue)]);

  // Attach the bull-board router to the NestJS app
  const httpAdapter = app.getHttpAdapter && app.getHttpAdapter();
  const expressApp = httpAdapter?.getInstance ? httpAdapter.getInstance() : app;
  expressApp.use('/admin/queues', router);
}
