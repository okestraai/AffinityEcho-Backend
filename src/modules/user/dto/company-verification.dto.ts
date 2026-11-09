import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

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

export class VerifyCompanyCodeDto {
  @ApiProperty({
    description: 'The 6-digit code from the company verification email',
    example: '482913',
  })
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email' })
  code!: string;
}
