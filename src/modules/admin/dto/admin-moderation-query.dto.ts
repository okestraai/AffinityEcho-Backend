import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminModerationQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional() @IsNumberString() page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional() @IsNumberString() limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by content type',
    enum: ['post', 'comment', 'nook_message'],
    example: 'post',
  })
  @IsOptional() @IsString() type?: string;

  @ApiPropertyOptional({
    description: 'Filter by moderation status',
    enum: ['visible', 'hidden', 'removed'],
    example: 'hidden',
  })
  @IsOptional() @IsString() status?: string;

  @ApiPropertyOptional({
    description: 'Set to "true" to return only content with reports_count > 0',
    example: 'true',
  })
  @IsOptional() @IsString() flagged?: string;
}
