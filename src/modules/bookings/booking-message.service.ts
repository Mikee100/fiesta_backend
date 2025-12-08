import { Injectable } from '@nestjs/common';

export type BookingPlatform = 'whatsapp' | 'instagram' | 'messenger';
export type BookingStep = 'collect_service' | 'collect_date' | 'collect_time' | 'collect_name' | 'review' | 'confirm_deposit' | 'confirmed' | 'cancelled';

@Injectable()
export class BookingMessageService {
  getMessage(step: BookingStep, data: any, platform: BookingPlatform): string {
    switch (step) {
      case 'collect_service':
        return this.format(`Which package would you like to book?`, platform);
      case 'collect_date':
        return this.format(`What date would you prefer for your session?`, platform);
      case 'collect_time':
        return this.format(`What time works best for you?`, platform);
      case 'collect_name':
        return this.format(`May I have your name for the booking?`, platform);
      case 'review':
        return this.format(
          `Please review your booking details:\nPackage: ${data.service}\nDate: ${data.date}\nTime: ${data.time}\nName: ${data.name}\nReply 'edit [field]' to change any detail, or 'confirm' to proceed.`,
          platform
        );
      case 'confirm_deposit':
        return this.format(
          `To confirm your booking, a deposit of KSH ${data.deposit} is required. Reply 'confirm' to accept and receive the payment prompt.`,
          platform
        );
      case 'confirmed':
        return this.format(`Your booking is confirmed! 🎉`, platform);
      case 'cancelled':
        return this.format(`Your booking has been cancelled.`, platform);
      default:
        return this.format(`How can I help you with your booking?`, platform);
    }
  }

  private format(message: string, platform: BookingPlatform): string {
    // Add platform-specific formatting if needed
    if (platform === 'instagram') {
      return message.replace(/\n/g, '\n'); // Instagram supports newlines
    }
    if (platform === 'whatsapp') {
      return message.replace(/\n/g, '\n'); // WhatsApp supports newlines
    }
    // Messenger or default
    return message;
  }
}
