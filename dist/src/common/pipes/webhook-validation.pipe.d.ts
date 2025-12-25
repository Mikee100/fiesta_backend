import { PipeTransform, ArgumentMetadata } from '@nestjs/common';
export declare class WebhookValidationPipe implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata): any;
}
