import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsArray,
  IsNotEmpty,
} from 'class-validator';

export class CreateMenteeProfileDto {
  // SHARED FIELDS (Required)
  @ApiProperty({ description: 'Bio' })
  @IsString()
  @IsNotEmpty()
  bio!: string;

  @ApiProperty({ description: 'Job title' })
  @IsString()
  @IsNotEmpty()
  jobTitle!: string;

  @ApiProperty({ description: 'Location' })
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiProperty({ description: 'Years of experience' })
  @IsNumber()
  yearsExperience!: number;

  // MENTEE-SPECIFIC FIELDS (Required)
  @ApiProperty({ description: 'Mentee goals' })
  @IsString()
  @IsNotEmpty()
  goals!: string;

  @ApiProperty({ description: 'Mentee topic' })
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @ApiProperty({ description: 'Availability' })
  @IsString()
  @IsNotEmpty()
  availability!: string;

  @ApiProperty({
    description: 'Urgency level',
    enum: ['low', 'medium', 'high'],
  })
  @IsIn(['low', 'medium', 'high'])
  urgency!: string;

  @ApiProperty({ description: 'Communication method' })
  @IsString()
  @IsNotEmpty()
  communicationMethod!: string;

  // OPTIONAL MENTEE FIELDS
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
