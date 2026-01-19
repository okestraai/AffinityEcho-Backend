import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class ScheduleSessionDto {
  @ApiProperty({ description: 'Relationship ID' })
  @IsUUID()
  relationship_id!: string;

  @ApiProperty({ description: 'Scheduled date and time' })
  @IsDateString()
  scheduled_at!: string;

  @ApiProperty({ description: 'Duration in minutes' })
  @IsNumber()
  duration_minutes!: number;

  @ApiPropertyOptional({ description: 'Session agenda' })
  @IsOptional()
  @IsString()
  agenda?: string;
}

export class StartMentorshipChatDto {
  @ApiProperty({ description: 'Direct request ID' })
  @IsUUID()
  request_id!: string;

  @ApiPropertyOptional({ description: 'Initial message' })
  @IsOptional()
  @IsString()
  initial_message?: string;
}

export class GetSessionHistoryDto {
  @ApiProperty({ description: 'Relationship ID' })
  @IsUUID()
  relationship_id!: string;

  @ApiPropertyOptional({
    default: 10,
    description: 'Number of sessions to fetch',
  })
  @IsOptional()
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Get sessions before this date' })
  @IsOptional()
  @IsDateString()
  before?: string;
}
