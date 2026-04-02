import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class VerifyCompanyEmailDto {
  @ApiProperty({ description: 'Company email address to verify', example: 'user@google.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
