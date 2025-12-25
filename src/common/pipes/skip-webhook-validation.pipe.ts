import { PipeTransform, Injectable, ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';

/**
 * Custom ValidationPipe that skips validation for webhook routes
 * This allows Meta's webhook payloads to pass through without strict validation
 */
@Injectable()
export class SkipWebhookValidationPipe extends ValidationPipe {
  transform(value: any, metadata: ArgumentMetadata) {
    // Check if this is a webhook route
    const request = metadata.data as any;
    if (request && typeof request === 'object' && 'url' in request) {
      const url = request.url;
      if (url && typeof url === 'string' && url.includes('/webhooks/')) {
        // Skip validation for webhook routes
        return value;
      }
    }
    
    // For webhook routes, check the metadata type
    if (metadata.type === 'body' && metadata.metatype) {
      const className = metadata.metatype.name || '';
      if (className.includes('Webhook') || className.includes('Dto')) {
        // Try to get the request from context if available
        // For now, just skip validation if it's a webhook-related DTO
      }
    }
    
    // Use parent ValidationPipe for non-webhook routes
    return super.transform(value, metadata);
  }
}


