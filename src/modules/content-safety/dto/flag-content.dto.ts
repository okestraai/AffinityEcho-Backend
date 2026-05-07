import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum FlagReason {
  SPAM = 'Spam',
  HARASSMENT = 'Harassment',
  HATE_SPEECH = 'Hate speech',
  INAPPROPRIATE = 'Inappropriate content',
  MISINFORMATION = 'Misinformation',
  OTHER = 'Other',
}

export class FlagContentDto {
  @ApiProperty({ enum: FlagReason })
  @IsEnum(FlagReason)
  reason!: FlagReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
