import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateMessengerCustomerDto {
  @IsString()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  messengerId?: string;
}
