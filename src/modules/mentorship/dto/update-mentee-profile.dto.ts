import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsNumber, IsArray } from 'class-validator';

export class UpdateMenteeProfileDto {
  // MENTEE-SPECIFIC FIELDS
  @ApiPropertyOptional({ description: 'Mentee goals' })
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiPropertyOptional({ description: 'Mentee topic' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({ description: 'Availability' })
  @IsOptional()
  @IsString()
  availability?: string;

  @ApiPropertyOptional({
    description: 'Urgency level',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  urgency?: string;

  @ApiPropertyOptional({ description: 'Communication method' })
  @IsOptional()
  @IsString()
  communicationMethod?: string;

  @ApiPropertyOptional({ description: 'Mentee bio' })
  @IsOptional()
  @IsString()
  menteeBio?: string;

  @ApiPropertyOptional({ description: 'Mentored style' })
  @IsOptional()
  @IsString()
  mentoredStyle?: string;

  @ApiPropertyOptional({ description: 'Mentee interests', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ description: 'Mentee industries', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menteeIndustries?: string[];

  @ApiPropertyOptional({ description: 'Mentee languages', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menteeLanguages?: string[];

  // SHARED FIELDS (Optional for updates)
  @ApiPropertyOptional({ description: 'Bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Job title' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Years of experience' })
  @IsOptional()
  @IsNumber()
  yearsExperience?: number;

  @ApiPropertyOptional({ description: 'Career level' })
  @IsOptional()
  @IsString()
  careerLevel?: string;

  @ApiPropertyOptional({ description: 'Company' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Affinity tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affinityTags?: string[];

  @ApiPropertyOptional({ description: 'Skills', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'LinkedIn URL' })
  @IsOptional()
  @IsString()
  linkedinUrl?: string;
}
