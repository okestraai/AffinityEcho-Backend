import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ForumFiltersDto {
  @ApiPropertyOptional({
    description: 'Search term for forum/topic names and descriptions',
    example: 'career growth',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sorting method for results',
    enum: ['relevant', 'recent', 'popular', 'trending'],
    example: 'recent',
    default: 'recent',
  })
  @IsOptional()
  @IsEnum(['relevant', 'recent', 'popular', 'trending'])
  sortBy?: 'relevant' | 'recent' | 'popular' | 'trending';

  @ApiPropertyOptional({
    description: 'Time filter for activity',
    enum: ['all', 'today', 'week', 'month'],
    example: 'week',
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['all', 'today', 'week', 'month'])
  timeFilter?: 'all' | 'today' | 'week' | 'month';

  @ApiPropertyOptional({
    description: 'Filter by company name',
    example: 'Google',
  })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific forum ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  forumId?: string;

  @ApiPropertyOptional({
    description: 'Filter by global forums only',
    example: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isGlobal?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by forum category',
    example: 'foundation',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter topics by hashtag (matched against tags array)',
    example: 'career-growth',
  })
  @IsOptional()
  @IsString()
  hashtag?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}
