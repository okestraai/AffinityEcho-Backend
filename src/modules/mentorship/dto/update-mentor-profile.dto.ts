import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class UpdateMentorProfileDto {
  // MENTOR-SPECIFIC FIELDS
  @ApiPropertyOptional({ description: 'User is willing to mentor' })
  @IsOptional()
  @IsBoolean()
  isWillingToMentor?: boolean;

  @ApiPropertyOptional({ description: 'Mentor bio' })
  @IsOptional()
  @IsString()
  mentorBio?: string;

  @ApiPropertyOptional({ description: 'Hourly rate' })
  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Areas of expertise', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];

  @ApiPropertyOptional({ description: 'Industries', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @ApiPropertyOptional({ description: 'Availability description' })
  @IsOptional()
  @IsString()
  availability?: string;

  @ApiPropertyOptional({ description: 'Response time' })
  @IsOptional()
  @IsString()
  responseTime?: string;

  @ApiPropertyOptional({ description: 'Mentoring style' })
  @IsOptional()
  @IsString()
  mentoringStyle?: string;

  @ApiPropertyOptional({ description: 'Languages spoken', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

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
