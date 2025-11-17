import { IsString, IsOptional, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum CareerLevel {
  ENTRY = 'Entry Level (0-2 years)',
  MID = 'Mid-level (3-7 years)',
  SENIOR = 'Senior (8-12 years)',
  LEADERSHIP = 'Leadership (13+ years)',
  EXECUTIVE = 'Executive/C-Suite'
}

export class OnboardingDataDto {
  @ApiPropertyOptional({ 
    example: 'Black/African American',
    description: 'User race/ethnicity - will be encrypted for privacy',
    examples: ['Black/African American', 'Hispanic/Latino', 'Asian/Pacific Islander', 'White', 'Prefer not to say']
  })
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional({ 
    example: 'Woman',
    description: 'User gender identity - will be encrypted for privacy',
    examples: ['Woman', 'Man', 'Non-binary', 'Prefer not to say']
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ 
    enum: CareerLevel,
    example: CareerLevel.MID,
    description: 'Professional career level'
  })
  @IsOptional()
  @IsEnum(CareerLevel)
  careerLevel?: CareerLevel;

  @ApiPropertyOptional({ 
    example: 'Google',
    description: 'Current employer',
    examples: ['Google', 'Microsoft', 'Amazon', 'Meta', 'Netflix']
  })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ 
    example: ['black-women-tech', 'women-leadership'],
    description: 'Affinity groups for community connection',
    examples: [
      ['black-women-tech'],
      ['latino-leaders', 'first-gen-college'],
      ['lgbtq-finance', 'working-parents']
    ]
  })
  @IsOptional()
  @IsArray()
  affinityTags?: string[];

  @ApiPropertyOptional({ 
    example: 'Senior Software Engineer',
    description: 'Professional job title',
    examples: ['Software Engineer', 'Product Manager', 'Data Scientist', 'UX Designer']
  })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ 
    example: 'San Francisco, CA',
    description: 'Geographic location for local connections',
    examples: ['San Francisco, CA', 'New York, NY', 'Remote', 'London, UK']
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ 
    example: ['JavaScript', 'React', 'Node.js'],
    description: 'Professional skills and technical expertise',
    examples: [
      ['JavaScript', 'TypeScript', 'React'],
      ['Python', 'Machine Learning', 'Data Analysis'],
      ['Product Management', 'Agile', 'User Research']
    ]
  })
  @IsOptional()
  @IsArray()
  skills?: string[];

  @ApiPropertyOptional({ 
    example: true,
    description: 'Indicates if user is open to mentoring others',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isWillingToMentor?: boolean;
}