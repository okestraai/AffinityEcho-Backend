import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsIn,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class MentorshipQueryDto {
  @ApiProperty({
    description: 'View mode',
    enum: ['mentors', 'mentees', 'all'],
    required: false,
  })
  @IsOptional()
  @IsIn(['mentors', 'mentees', 'all'])
  viewMode?: string;

  @ApiProperty({ description: 'Search term', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Career levels',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  careerLevel?: string[];

  @ApiProperty({
    description: 'Expertise areas',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  expertise?: string[];

  @ApiProperty({ description: 'Industries', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  industries?: string[];

  @ApiProperty({
    description: 'Affinity tags',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  affinityTags?: string[];

  @ApiProperty({
    description: 'Availability',
    enum: ['immediate', 'within_week', 'within_month', 'all'],
    required: false,
  })
  @IsOptional()
  @IsIn(['immediate', 'within_week', 'within_month', 'all'])
  availability?: string;

  @ApiProperty({ description: 'Languages spoken', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  languages?: string[];

  @ApiProperty({ description: 'Location', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ description: 'Page number', required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ description: 'Items per page', required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Sort by',
    enum: ['match_score', 'recent', 'experience', 'availability'],
    required: false,
  })
  @IsOptional()
  @IsIn(['match_score', 'recent', 'experience', 'availability'])
  sortBy?: string;

  @ApiProperty({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    required: false,
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: string = 'desc';

  @ApiProperty({
    description: 'Minimum match score',
    required: false,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minMatchScore?: number;

  @ApiProperty({
    description: 'Maximum match score',
    required: false,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxMatchScore?: number;
}
