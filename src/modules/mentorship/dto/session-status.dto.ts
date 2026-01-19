import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class SessionStatusDto {
  @ApiProperty({
    description: 'Action to perform',
    enum: ['complete', 'cancel', 'reschedule'],
  })
  @IsString()
  @IsIn(['complete', 'cancel', 'reschedule'])
  action!: string;

  @ApiProperty({
    description: 'New scheduled time (for reschedule)',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

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

  @ApiProperty({
    description: 'Rating (1-5)',
    required: false,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ description: 'Feedback', required: false })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiProperty({ description: 'Reason for cancellation', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
