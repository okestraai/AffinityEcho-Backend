// src/auth/dto/update-profile.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsBoolean, IsNumber, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User avatar',
    example: 'User'
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'User bio',
    example: 'Software developer passionate about open source'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Company name',
    example: 'Tech Corp'
  })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({
    description: 'Job title',
    example: 'Senior Developer'
  })
  @IsOptional()
  @IsString()
  job_title?: string;

  @ApiPropertyOptional({
    description: 'Location',
    example: 'San Francisco, CA'
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Years of experience',
    example: 5
  })
  @IsOptional()
  @IsNumber()
  years_experience?: number;

  @ApiPropertyOptional({
    description: 'Skills array',
    example: ['JavaScript', 'TypeScript', 'Node.js']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({
    description: 'LinkedIn URL',
    example: 'https://linkedin.com/in/username'
  })
  @IsOptional()
  @IsString()
  linkedin_url?: string;

  @ApiPropertyOptional({
    description: 'Willing to mentor',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  is_willing_to_mentor?: boolean;

  @ApiPropertyOptional({
    description: 'Career level',
    example: 'senior'
  })
  @IsOptional()
  @IsString()
  career_level?: string;

  @ApiPropertyOptional({
    description: 'Affinity tags',
    example: ['tech', 'programming', 'startups']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affinity_tags?: string[];

  @ApiPropertyOptional({
    description: 'Privacy level',
    example: 'public'
  })
  @IsOptional()
  @IsString()
  privacy_level?: string;
}