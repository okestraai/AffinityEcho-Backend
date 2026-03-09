import { IsOptional, IsString, IsNumberString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminForumQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional() @IsNumberString() page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional() @IsNumberString() limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by forum scope',
    enum: ['global', 'company'],
    example: 'global',
  })
  @IsOptional() @IsString() type?: string;

  @ApiPropertyOptional({ description: 'Filter by forum name (partial match)', example: 'career' })
  @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ description: 'Column to sort by', example: 'created_at' })
  @IsOptional() @IsString() sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
