import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsappId?: string;

  @IsString()
  @IsOptional()
  instagramId?: string;

  @IsString()
  @IsOptional()
  messengerId?: string;
}
