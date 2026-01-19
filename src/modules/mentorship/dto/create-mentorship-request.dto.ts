import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsIn,
  IsUUID,
  IsNumber,
  IsArray,
} from 'class-validator';

export class CreateMentorshipRequestDto {
  @ApiProperty({
    description: 'Target user ID (optional for general requests)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @ApiProperty({ description: 'Topic' })
  @IsString()
  topic!: string;

  @ApiProperty({ description: 'Goals' })
  @IsString()
  goals!: string;

  @ApiProperty({ description: 'Availability' })
  @IsString()
  availability!: string;

  @ApiProperty({ description: 'Communication method' })
  @IsString()
  communicationMethod!: string;

  @ApiProperty({
    description: 'Urgency level',
    enum: ['low', 'medium', 'high'],
  })
  @IsIn(['low', 'medium', 'high'])
  urgency!: string;

  // New fields for mentee profile creation
  @ApiProperty({ description: 'Job title', required: false })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiProperty({ description: 'Encrypted Company', required: false })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({ description: 'Years of experience', required: false })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  @ApiProperty({ description: 'Location', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ description: 'Encrypted Career level', required: false })
  @IsOptional()
  @IsString()
  careerLevel?: string;

  @ApiProperty({ description: 'Mentee bio', required: false })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ description: 'Skills', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({
    description: 'Mentee interests',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menteeInterests?: string[];

  @ApiProperty({ description: 'Encrypted Affinity tags', required: false })
  @IsOptional()
  @IsString()
  affinityTags?: string;

  @ApiProperty({
    description: 'Languages spoken',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiProperty({ description: 'Mentoring style', required: false })
  @IsOptional()
  @IsString()
  mentoringStyle?: string;

  @ApiProperty({ description: 'Industries', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @ApiProperty({
    description: 'Areas of expertise',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];
}
