import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BasicProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() first_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() last_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() username?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatar?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() job_title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() years_experience?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
}

export class CompanyProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() company_name?: string;
}

export class IdentityProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() career_level?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() race?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() affinity_tags?: string;
}

export class MentorSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() mentor_bio?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) expertise?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) industries?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() availability?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() response_time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mentoring_style?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() hourly_rate?: number;
}

export class MenteeSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() mentee_bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goals?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) interests?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) industries?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() availability?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['low', 'medium', 'high']) urgency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() topic?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mentored_style?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() communication_method?: string;
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
