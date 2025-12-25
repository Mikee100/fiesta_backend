import { ValidationPipe, ValidationPipeOptions, ArgumentMetadata } from '@nestjs/common';
export declare class ConditionalValidationPipe extends ValidationPipe {
    constructor(options?: ValidationPipeOptions);
    transform(value: any, metadata: ArgumentMetadata): any;
}
