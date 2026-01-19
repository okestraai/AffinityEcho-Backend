import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ description: 'Career level' })
  @IsString()
  @IsNotEmpty()
  careerLevel!: string;

  @ApiProperty({ description: 'Company' })
  @IsString()
  company!: string;

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
  @ApiProperty({ description: 'Mentee bio', required: false })
  @IsOptional()
  @IsString()
  menteeBio?: string;

  @ApiProperty({ description: 'Mentored style', required: false })
  @IsOptional()
  @IsString()
  mentoredStyle?: string;

  @ApiProperty({
    description: 'Mentee interests',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiProperty({
    description: 'Mentee industries',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menteeIndustries?: string[];

  @ApiProperty({
    description: 'Mentee languages',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menteeLanguages?: string[];

  // OPTIONAL SHARED FIELDS
  @ApiProperty({ description: 'Affinity tags', required: false })
  @IsOptional()
  @IsString()
  affinityTags?: string;

  @ApiProperty({ description: 'Skills', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ description: 'LinkedIn URL', required: false })
  @IsOptional()
  @IsString()
  linkedinUrl?: string;
}
