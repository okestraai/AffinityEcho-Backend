import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
  IsISO31661Alpha2,
  IsBoolean,
  IsInt,
  Min,
  Max,
  Length,
  MaxLength,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MAX_ETHNICITIES } from '../../../common/constants/onboarding-options';

const THIS_YEAR = new Date().getFullYear();

export class BasicProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() first_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() last_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() username?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatar?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() job_title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional({ example: 'GB', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO31661Alpha2()
  country_code?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() years_experience?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

export class CompanyProfileDto {
  @ApiPropertyOptional({ description: 'Empty string removes the company' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  company_name?: string;
}

export class IdentityProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() career_level?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() race?: string;
  @ApiPropertyOptional({
    example: ['South Asian'],
    description: 'Up to 5; replaces race',
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
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() affinity_tags?: string;
}

export class MentorSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() mentor_bio?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() availability?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() response_time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mentoring_style?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() hourly_rate?: number;
}

export class MenteeSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() mentee_bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goals?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() availability?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  urgency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() topic?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mentored_style?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  communication_method?: string;
}

export class SchoolProfileDto {
  @ApiPropertyOptional({ description: 'Currently a student, at any level' })
  @IsOptional()
  @IsBoolean()
  is_student?: boolean;

  @ApiPropertyOptional({ example: 'University of Lagos' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  school_name?: string;

  @ApiPropertyOptional({ description: 'null clears it' })
  @IsOptional()
  @IsInt()
  @Min(THIS_YEAR)
  @Max(THIS_YEAR + 8)
  expected_grad_year?: number | null;

  @ApiPropertyOptional({ description: 'Show the school on the profile' })
  @IsOptional()
  @IsBoolean()
  show_school?: boolean;
}

export class UnifiedProfileEditDto {
  @ApiPropertyOptional({ type: BasicProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BasicProfileDto)
  basic?: BasicProfileDto;

  @ApiPropertyOptional({ type: CompanyProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyProfileDto)
  company?: CompanyProfileDto;

  @ApiPropertyOptional({ type: SchoolProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SchoolProfileDto)
  school?: SchoolProfileDto;

  @ApiPropertyOptional({ type: IdentityProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IdentityProfileDto)
  identity?: IdentityProfileDto;

  @ApiPropertyOptional({ type: MentorSectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MentorSectionDto)
  mentor?: MentorSectionDto;

  @ApiPropertyOptional({ type: MenteeSectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenteeSectionDto)
  mentee?: MenteeSectionDto;
}
