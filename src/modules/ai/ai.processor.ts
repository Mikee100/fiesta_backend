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
    const { customerId, bookingId, date, time, recipientName } = job.data;

    const reminderMessage =
      `Hi ${recipientName}! 💖\n\n` +
      `Just a sweet reminder that your maternity photoshoot ` +
      `is coming up in *2 days* — on *${date} at ${time}*. ` +
      `We’re excited to capture your beautiful moments! ✨📸`;

    await this.messagesService.sendOutboundMessage(customerId, reminderMessage, 'whatsapp');
    return true;
  }
}
