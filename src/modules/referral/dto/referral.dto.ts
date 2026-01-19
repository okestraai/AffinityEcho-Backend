import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsInt,
  IsUrl,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty({ enum: ['request', 'offer'] })
  @IsEnum(['request', 'offer'])
  type!: 'request' | 'offer';

  @ApiProperty({ example: 'Looking for Software Engineer referral at Google' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Google' })
  @IsString()
  @MaxLength(100)
  company!: string;

  @ApiPropertyOptional({ example: 'Senior Software Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'https://careers.google.com/jobs/123' })
  @IsOptional()
  @IsUrl()
  jobLink?: string;

  @ApiProperty({ example: 'Experienced full-stack developer...' })
  @IsString()
  description!: string;

  @ApiProperty({ enum: ['global', 'company'], default: 'global' })
  @IsEnum(['global', 'company'])
  scope!: 'global' | 'company';

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  availableSlots?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  totalSlots?: number;

  @ApiPropertyOptional({ example: ['software-engineering', 'react'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: ['JavaScript', 'React', 'Node.js'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @ApiPropertyOptional({ example: '5+ years experience' })
  @IsOptional()
  @IsString()
  preferredExperience?: string;

  @ApiPropertyOptional({ example: ['group1', 'group2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affinityGroups?: string[];
}

export class UpdateReferralDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['open', 'closed'] })
  @IsOptional()
  @IsEnum(['open', 'closed'])
  status?: 'open' | 'closed';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  availableSlots?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class GetReferralsQueryDto {
  @ApiPropertyOptional({ enum: ['request', 'offer', 'all'] })
  @IsOptional()
  @IsEnum(['request', 'offer', 'all'])
  type?: 'request' | 'offer' | 'all';

  @ApiPropertyOptional({ enum: ['open', 'closed', 'all'] })
  @IsOptional()
  @IsEnum(['open', 'closed', 'all'])
  status?: 'open' | 'closed' | 'all';

  @ApiPropertyOptional({ enum: ['global', 'company', 'all'] })
  @IsOptional()
  @IsEnum(['global', 'company', 'all'])
  scope?: 'global' | 'company' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['recent', 'popular', 'relevant'] })
  @IsOptional()
  @IsEnum(['recent', 'popular', 'relevant'])
  sortBy?: 'recent' | 'popular' | 'relevant';

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  // Add this cursor property - it's used for pagination
  @ApiPropertyOptional({ description: 'Cursor for pagination (timestamp)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
