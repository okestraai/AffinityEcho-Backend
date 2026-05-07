// src/modules/auth/dto/onboarding.dto.ts
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CareerLevel {
  ENTRY = 'Entry Level (0-2 years)',
  MID = 'Mid-level (3-7 years)',
  SENIOR = 'Senior (8-12 years)',
  LEADERSHIP = 'Leadership (13+ years)',
  EXECUTIVE = 'Executive/C-Suite',
}

export enum CompanyType {
  STATIC = 'static',
  OTHER = 'other',
}

export class OnboardingDataDto {
  @ApiProperty({ example: 'John', description: 'First name (required)' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name (required)' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

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
    description: 'Type of company - static (from list) or other (custom)',
    enum: CompanyType,
    example: CompanyType.STATIC,
  })
  @IsOptional()
  @IsEnum(CompanyType)
  companyType?: CompanyType;

  @ApiPropertyOptional({
    description: 'Affinity groups for community connection',
    example: ['black-professionals', 'lgbtq-leaders'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affinityTags?: string[];

  @ApiPropertyOptional({ example: true, description: 'User confirmed age 17+' })
  @IsOptional()
  @IsBoolean()
  ageConfirmed?: boolean;
}
