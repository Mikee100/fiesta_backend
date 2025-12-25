import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
export declare class SkipWebhookValidationPipe extends ValidationPipe {
    transform(value: any, metadata: ArgumentMetadata): any;
}
