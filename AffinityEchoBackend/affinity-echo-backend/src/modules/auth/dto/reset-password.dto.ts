// password.dto.ts - Add this new DTO
import { IsString, IsEmail, MinLength,  Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordWithOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'newSecurePassword123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
   @Length(6, 6)
  otp!: string;
}