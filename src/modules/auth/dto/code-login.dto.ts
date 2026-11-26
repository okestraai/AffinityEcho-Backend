import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendCodeDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    description:
      'Sign-in only: no code is sent and no account is made for an unknown email',
  })
  @IsOptional()
  @IsBoolean()
  existingOnly?: boolean;
}

export class VerifyCodeDto extends SendCodeDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;

  @ApiPropertyOptional({
    description: 'Saved for a new account, so onboarding does not ask again',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Needed when the code creates a new account',
  })
  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;
}

export class SetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}
