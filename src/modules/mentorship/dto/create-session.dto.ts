import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'Session date and time' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ description: 'Duration in minutes' })
  @IsNumber()
  @Min(15)
  durationMinutes!: number;

  @ApiProperty({ description: 'Meeting URL', required: false })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiProperty({ description: 'Session agenda', required: false })
  @IsOptional()
  @IsString()
  agenda?: string;
}
