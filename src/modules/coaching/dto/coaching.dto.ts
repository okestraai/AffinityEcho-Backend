import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StartSessionDto {
  @ApiPropertyOptional({ enum: ['text', 'voice'], default: 'text' })
  @IsOptional()
  @IsIn(['text', 'voice'])
  modality?: 'text' | 'voice';
}

export class TurnDto {
  @ApiProperty({ description: 'The client message for this turn.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ enum: ['text', 'voice'], default: 'text' })
  @IsOptional()
  @IsIn(['text', 'voice'])
  modality?: 'text' | 'voice';
}

export class ConsentDto {
  @ApiProperty({ description: 'Consent to collect coaching/wellbeing data.' })
  @IsIn([true, false])
  collect!: boolean;

  @ApiProperty({ description: 'Separate, unbundled consent to share data.' })
  @IsIn([true, false])
  share!: boolean;
}

export class TtsDto {
  @ApiProperty({ description: 'Text for the coach voice to speak.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @ApiPropertyOptional({ description: 'Override Azure voice name.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  voice?: string;
}

export class FeedbackDto {
  @ApiProperty({ description: 'Star rating, 1 to 5.', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Optional free-form feedback.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class SttDto {
  @ApiProperty({ description: 'Base64-encoded audio recorded by the client.' })
  @IsString()
  @MinLength(1)
  audioBase64!: string;

  @ApiPropertyOptional({
    description: 'MIME/content-type of the audio (e.g. audio/wav).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;
}
