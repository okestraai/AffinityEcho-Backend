// src/modules/auth/dto/onboarding.dto.ts
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsBoolean,
  IsISO31661Alpha2,
  IsInt,
  Min,
  Max,
  Length,
  MaxLength,
  ArrayMaxSize,
  Matches,
  ValidateIf,
  Equals,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_ETHNICITIES } from '../../../common/constants/onboarding-options';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CareerLevel {
  ENTRY = 'Entry Level (0-2 years)',
  MID = 'Mid-level (3-7 years)',
  SENIOR = 'Senior (8-12 years)',
  LEADERSHIP = 'Leadership (13+ years)',
  EXECUTIVE = 'Executive/C-Suite',
  NOT_WORKING = 'Not currently working',
  SELF_EMPLOYED = 'Self-employed',
  PREFER_NOT_TO_SAY = 'Prefer not to say',
}

const THIS_YEAR = new Date().getFullYear();

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

  @ApiPropertyOptional({
    example: 'Google',
    description: 'Optional, any country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
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

  @ApiPropertyOptional({
    example: 'NG',
    description:
      'Country, ISO 3166-1 alpha-2. Optional here so older app versions keep working; the apps require it.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  country?: string;

  @ApiPropertyOptional({
    description: 'Ethnicity or heritage, up to 5. Replaces race when sent.',
    example: ['Black / African', 'Caribbean'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ETHNICITIES)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  @Matches(/^[^,]+$/, {
    each: true,
    message: 'Ethnicity values cannot contain commas',
  })
  ethnicities?: string[];

  @ApiPropertyOptional({
    example: true,
    description: 'Currently a student, at any level',
  })
  @IsOptional()
  @IsBoolean()
  isStudent?: boolean;

  @ApiPropertyOptional({
    example: 'University of Lagos',
    description: 'Required when isStudent is true. Stored encrypted.',
  })
  @ValidateIf((o: OnboardingDataDto) => o.isStudent === true)
  @IsString()
  @Length(2, 120)
  school?: string;

  @ApiPropertyOptional({ example: THIS_YEAR + 2 })
  @IsOptional()
  @IsInt()
  @Min(THIS_YEAR)
  @Max(THIS_YEAR + 8)
  expectedGradYear?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Show the school on the profile',
  })
  @IsOptional()
  @IsBoolean()
  showSchool?: boolean;

  @ApiProperty({ example: true, description: 'User confirmed age 18+' })
  @Equals(true, { message: 'Confirm that you are 18 or older' })
  ageConfirmed!: boolean;
}
