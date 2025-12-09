import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { AiService } from './ai.service';
import { MessagesService } from '../messages/messages.service';

@Processor('aiQueue')
export class AiProcessor {
  constructor(
    private aiService: AiService,
    private messagesService: MessagesService,
  ) {}

  @Process('sendReminder')
  async handleReminder(job: Job) {
    const { customerId, bookingId, date, time, recipientName, daysBefore } = job.data;

    let dayText = '';
    if (daysBefore === '2') {
      dayText = 'in *2 days*';
    } else if (daysBefore === '1') {
      dayText = 'tomorrow';
    } else {
      dayText = `soon`;
    }

    const reminderMessage =
      `Hi ${recipientName}! 💖\n\n` +
      `Just a sweet reminder that your maternity photoshoot ` +
      `is coming up ${dayText} — on *${date} at ${time}*. ` +
      `We’re excited to capture your beautiful moments! ✨📸`;

    await this.messagesService.sendOutboundMessage(customerId, reminderMessage, 'whatsapp');
    return true;
  }

  // Generic processor for all aiQueue jobs
  @Process()
  async handleAnyJob(job: Job) {
    console.log(`[AI DEBUG] Processing generic job:`, job.data);
    if (job.data && job.data.question) {
      const answer = await this.aiService.processAiRequest(job.data);
      console.log(`[AI DEBUG] AI answer:`, answer);
      return { answer };
    }
    return { status: 'processed', data: job.data };
  }
}
