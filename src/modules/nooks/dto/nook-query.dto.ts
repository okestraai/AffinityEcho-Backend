import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class NookQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 8, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 8;

  @ApiProperty({
    required: false,
    enum: ['high', 'medium', 'low', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['high', 'medium', 'low', 'all'])
  urgency?: string = 'all';

  @ApiProperty({
    required: false,
    enum: ['company', 'global', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['company', 'global', 'all'])
  scope?: string = 'all';

  @ApiProperty({
    required: false,
    enum: ['hot', 'warm', 'cool', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['hot', 'warm', 'cool', 'all'])
  temperature?: string = 'all';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hashtag?: string;

  @ApiProperty({
    required: false,
    enum: ['created_at', 'last_activity_at', 'members_count', 'trending'],
    default: 'created_at',
  })
  @IsOptional()
  @IsEnum(['created_at', 'last_activity_at', 'members_count', 'trending'])
  sortBy?: string = 'created_at';

  @ApiProperty({
    required: false,
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: string = 'desc';
}
