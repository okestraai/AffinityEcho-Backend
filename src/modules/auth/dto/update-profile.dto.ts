// src/auth/dto/update-profile.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsNumber,
  MaxLength,
  IsIn,
} from 'class-validator';

export class UpdateProfileDto {
  // Non-sensitive: can stay in plaintext
  @ApiPropertyOptional({
    description: 'Display name or avatar identifier',
    example: 'BraveLeader42',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Short bio/description (publicly visible)',
    example: 'Building the future of work @ Affinity Echo',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Job title (publicly visible)',
    example: 'Senior Software Engineer',
  })
  @IsOptional()
  @IsString()
  job_title?: string;

  @ApiPropertyOptional({
    description: 'Location (publicly visible)',
    example: 'San Francisco, CA',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Years of professional experience',
    example: 7,
  })
  @IsOptional()
  @IsNumber()
  years_experience?: number;

  @ApiPropertyOptional({
    description: 'Technical/personal skills (publicly visible)',
    example: ['TypeScript', 'React', 'Node.js', 'Mentorship'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({
    description: 'LinkedIn profile URL',
    example: 'https://linkedin.com/in/johndoe',
  })
  @IsOptional()
  @IsString()
  linkedin_url?: string;

  @ApiPropertyOptional({
    description: 'Open to mentoring others',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_willing_to_mentor?: boolean;

  @ApiPropertyOptional({
    description: 'Privacy visibility level',
    enum: ['anonymous', 'connections_only', 'public'],
    example: 'public',
  })
  @IsOptional()
  @IsString()
  @IsIn(['anonymous', 'connections_only', 'public'])
  privacy_level?: 'anonymous' | 'connections_only' | 'public';

  // ==================== ENCRYPTED FIELDS ====================

  @ApiPropertyOptional({
    description:
      'ENCRYPTED company name (sent encrypted from frontend using shared key)',
    example: 'U2FsdGVkX1+abc123...',
  })
  @IsOptional()
  @IsString()
  company_encrypted?: string;

  @ApiPropertyOptional({
    description: 'ENCRYPTED career level (e.g., "mid", "senior", "lead")',
    example: 'U2FsdGVkX1+xyz789...',
  })
  @IsOptional()
  @IsString()
  career_level_encrypted?: string;

  @ApiPropertyOptional({
    description: 'ENCRYPTED race/ethnicity (for diversity analytics only)',
    example: 'U2FsdGVkX1+def456...',
  })
  @IsOptional()
  @IsString()
  race_encrypted?: string;

  @ApiPropertyOptional({
    description: 'ENCRYPTED gender identity',
    example: 'U2FsdGVkX1+ghi789...',
  })
  @IsOptional()
  @IsString()
  gender_encrypted?: string;

  @ApiPropertyOptional({
    description:
      'ENCRYPTED affinity/identity tags (e.g., LGBTQ+, Veteran, First-Gen, etc.)',
    example: 'U2FsdGVkX1+jkl012...',
  })
  @IsOptional()
  @IsString()
  affinity_tags_encrypted?: string;
}
