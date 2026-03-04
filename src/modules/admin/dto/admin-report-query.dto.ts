import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminReportQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional() @IsNumberString() page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional() @IsNumberString() limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by report status',
    enum: ['submitted', 'under_review', 'resolved', 'declined'],
    example: 'submitted',
  })
  @IsOptional() @IsString() status?: string;

  @ApiPropertyOptional({
    description: 'Filter by incident type',
    enum: ['verbal', 'written', 'physical', 'sexual', 'discriminatory', 'cyber', 'retaliation', 'other'],
    example: 'verbal',
  })
  @IsOptional() @IsString() type?: string;

  @ApiPropertyOptional({
    description: 'Filter by priority — "high" returns immediate_risk = true only',
    enum: ['high'],
    example: 'high',
  })
  @IsOptional() @IsString() priority?: string;

  @ApiPropertyOptional({
    description: 'Filter by assignee — "me" for current user, "unassigned", or a specific userId UUID',
    example: 'me',
  })
  @IsOptional() @IsString() assignedTo?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['created_at', 'status'],
    example: 'created_at',
  })
  @IsOptional() @IsString() sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional() @IsString() sortOrder?: string;
}
