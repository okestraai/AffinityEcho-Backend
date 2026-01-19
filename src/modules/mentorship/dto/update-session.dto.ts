import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';

export class UpdateSessionDto {
  @ApiProperty({ description: 'Session date and time', required: false })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ description: 'Duration in minutes', required: false })
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @ApiProperty({ description: 'Meeting URL', required: false })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiProperty({ description: 'Session agenda', required: false })
  @IsOptional()
  @IsString()
  agenda?: string;

  @ApiProperty({ description: 'Session status', required: false })
  @IsOptional()
  @IsIn(['scheduled', 'completed', 'cancelled'])
  status?: string;

  @ApiProperty({ description: 'Mentor notes', required: false })
  @IsOptional()
  @IsString()
  mentorNotes?: string;

  @ApiProperty({ description: 'Mentee notes', required: false })
  @IsOptional()
  @IsString()
  menteeNotes?: string;

  @ApiProperty({ description: 'Session notes', required: false })
  @IsOptional()
  @IsString()
  sessionNotes?: string;
}
