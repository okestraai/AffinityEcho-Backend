import { IsOptional, IsString, IsNumberString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// These must match your frontend exactly
export const INCIDENT_TYPES = [
  'Racial discrimination',
  'Gender-based harassment',
  'Sexual harassment',
  'Hostile work environment',
  'Retaliation',
  'Bullying',
  'Microaggressions',
  'Other',
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export class AdminReportQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by report status',
    enum: ['submitted', 'under_review', 'resolved', 'declined'],
    example: 'submitted',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by incident type',
    enum: INCIDENT_TYPES, // Uses the correct frontend types
    example: 'Sexual harassment',
  })
  @IsOptional()
  @IsString()
  @IsIn(INCIDENT_TYPES) // Validates against frontend types
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['critical', 'high', 'medium', 'low'],
    example: 'critical',
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({
    description:
      'Filter by assignee — "me" for current user, "unassigned", or a specific userId UUID',
    example: 'me',
  })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['created_at', 'status', 'incident_type', 'updated_at'],
    example: 'created_at',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}

// Export DTO - extends the query DTO and adds format field
export class AdminReportExportQueryDto extends AdminReportQueryDto {
  @ApiPropertyOptional({
    description: 'Export format',
    enum: ['csv', 'pdf'],
    example: 'pdf',
    required: true,
  })
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';
}
