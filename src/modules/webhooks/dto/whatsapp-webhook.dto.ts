export class WhatsAppWebhookDto {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: any;
    }>;
  }>;
  [key: string]: any; // Allow any additional properties
}


