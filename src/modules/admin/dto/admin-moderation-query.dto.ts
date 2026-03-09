import { IsOptional, IsString, IsNumberString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminModerationQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by content type',
    enum: [
      'feed_post',
      'feed_comment',
      'forum_topic',
      'forum_comment',
      'nook',
      'nook_message',
    ],
    example: 'feed_post',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by moderation status',
    enum: ['visible', 'hidden', 'removed'],
    example: 'hidden',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Set to "true" to return only content with reports_count > 0',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  flagged?: string;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['created_at', 'updated_at', 'reports_count'],
    example: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'updated_at', 'reports_count'])
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

// Export DTO - extends the query DTO and adds format field
export class AdminModerationExportQueryDto extends AdminModerationQueryDto {
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
