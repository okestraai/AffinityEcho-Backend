import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class VerifyCompanyEmailDto {
  @ApiProperty({
    description: 'Company email address to verify',
    example: 'user@google.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class UpdateVerificationEmailDto {
  @ApiProperty({
    description: 'New company email address to use for pending verification',
    example: 'newuser@google.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
