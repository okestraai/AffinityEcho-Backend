import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum FeedFilter {
  ALL = 'all',
  FOLLOWING = 'following',
  TRENDING = 'trending',
  COMPANY = 'company',
  GLOBAL = 'global',
}

export enum FeedSortBy {
  RECENT = 'recent',
  POPULAR = 'popular',
  MOST_LIKED = 'most_liked',
  MOST_COMMENTED = 'most_commented',
  ENGAGEMENT = 'engagement',
}

export enum ContentTypeFilter {
  ALL = 'all',
  POST = 'post',
  TOPIC = 'topic',
  NOOK = 'nook_message',
}

export class QueryFeedDto {
  @ApiProperty({
    description: 'Feed filter type',
    enum: FeedFilter,
    default: FeedFilter.ALL,
    required: false,
  })
  @IsOptional()
  @IsEnum(FeedFilter)
  filter?: FeedFilter;

  @ApiProperty({
    description: 'Content type filter',
    enum: ContentTypeFilter,
    default: ContentTypeFilter.ALL,
    required: false,
  })
  @IsOptional()
  @IsEnum(ContentTypeFilter)
  contentType?: ContentTypeFilter;

  @ApiProperty({
    description: 'Sort by',
    enum: FeedSortBy,
    default: FeedSortBy.ENGAGEMENT,
    required: false,
  })
  @IsOptional()
  @IsEnum(FeedSortBy)
  sortBy?: FeedSortBy;

  @ApiProperty({
    description: 'Company filter (for company-specific content)',
    required: false,
  })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({
    description: 'Tags filter',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Page number',
    default: 1,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Content IDs already seen by the client (suppressed in ranking, not permanently hidden)',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  seenIds?: string[];
}
