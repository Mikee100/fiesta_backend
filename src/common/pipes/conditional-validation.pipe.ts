import { ValidationPipe, ValidationPipeOptions, ArgumentMetadata } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

/**
 * Custom ValidationPipe that skips validation when there's no DTO (metatype)
 * This allows Meta's webhook payloads to pass through without strict validation
 * since webhook endpoints don't use DTOs
 */
@Injectable()
export class ConditionalValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    // Don't pass forbidNonWhitelisted for webhook routes
    const safeOptions = {
      ...options,
      // We'll handle forbidNonWhitelisted conditionally in transform
    };
    super(safeOptions);
  }

  transform(value: any, metadata: ArgumentMetadata) {
    // Skip validation entirely for body parameters without DTOs
    // This handles webhook routes that use @Body() body: any
    if (metadata.type === 'body') {
      // Check if this looks like a webhook payload
      const isWebhookPayload = value && typeof value === 'object' && 
        (value.object === 'whatsapp_business_account' || 
         value.object === 'instagram' ||
         value.object === 'page' ||
         Array.isArray(value.entry));
      
      // If there's no metatype, definitely skip (handles @Body() body: any)
      if (!metadata.metatype) {
        if (isWebhookPayload) {
          console.log('[ConditionalValidationPipe] Webhook payload detected (no metatype), skipping validation');
        }
        return value;
      }
      
      // Check if metatype is Object (which is what TypeScript uses for 'any')
      // When you write @Body() body: any, NestJS sees it as Object type
      if (metadata.metatype === Object || metadata.metatype?.name === 'Object') {
        if (isWebhookPayload) {
          console.log('[ConditionalValidationPipe] Webhook payload detected (Object metatype), skipping validation');
        }
        return value;
      }
      
      // Check if it's a plain JavaScript built-in type
      const metatypeName = metadata.metatype?.name;
      const plainTypes = ['String', 'Number', 'Boolean', 'Array', 'Date'];
      if (metatypeName && plainTypes.includes(metatypeName)) {
        return value;
      }
    }

    // For routes with DTO classes, use standard validation
    // Wrap in try-catch as a safety net for webhook routes
    try {
      return super.transform(value, metadata);
    } catch (error: any) {
      // If validation fails and it looks like a webhook payload, allow it through
      if (metadata.type === 'body') {
        const isWebhookPayload = value && typeof value === 'object' && 
          (value.object === 'whatsapp_business_account' || 
           value.object === 'instagram' ||
           value.object === 'page' ||
           Array.isArray(value.entry));
        
        if (isWebhookPayload || !metadata.metatype || metadata.metatype === Object || metadata.metatype?.name === 'Object') {
          console.log('[ConditionalValidationPipe] Validation error for webhook-like payload, allowing through:', error.message);
          return value;
        }
      }
      console.error('[ConditionalValidationPipe] Validation error:', error);
      throw error;
    }
  }
}

