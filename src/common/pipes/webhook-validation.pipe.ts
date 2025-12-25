import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * Custom validation pipe that skips validation for webhook routes
 * This allows Meta's webhook payloads to pass through without strict validation
 */
@Injectable()
export class WebhookValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // Skip validation for webhook routes - just return the value as-is
    return value;
  }
}


