// src/modules/auth/dto/onboarding.dto.ts
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum CareerLevel {
  ENTRY = 'Entry Level (0-2 years)',
  MID = 'Mid-level (3-7 years)',
  SENIOR = 'Senior (8-12 years)',
  LEADERSHIP = 'Leadership (13+ years)',
  EXECUTIVE = 'Executive/C-Suite',
}

export class OnboardingDataDto {
  @ApiPropertyOptional({
    description: 'User race/ethnicity - will be encrypted',
    examples: [
      'Black/African American',
      'Hispanic/Latino',
      'Asian',
      'White',
      'Prefer not to say',
    ],
  })
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional({
    description: 'User gender - will be encrypted',
    examples: ['Woman', 'Man', 'Non-binary', 'Prefer not to say'],
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ enum: CareerLevel })
  @IsOptional()
  @IsEnum(CareerLevel)
  careerLevel?: CareerLevel;

  @ApiPropertyOptional({ example: 'Google' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({
    description: 'Affinity groups for community connection',
    example: ['black-women-tech', 'lgbtq-leaders'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affinityTags?: string[];
}
