import { IsOptional, IsString, IsNumberString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminForumQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by space tab',
    enum: ['global', 'shared', 'company', 'students'],
    example: 'students',
  })
  @IsOptional()
  @IsIn(['global', 'shared', 'company', 'students'])
  type?: string;

  @ApiPropertyOptional({
    description: 'One company space by name',
    example: 'Google',
  })
  @IsOptional()
  @IsString()
  space?: string;

  @ApiPropertyOptional({
    description: 'Filter by forum name (partial match)',
    example: 'career',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Column to sort by',
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
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
