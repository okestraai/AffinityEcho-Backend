import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';

export class CreateMentorProfileDto {
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

  // MENTOR-SPECIFIC FIELDS (Optional)
  @ApiProperty({ description: 'User is willing to mentor' })
  @IsBoolean()
  isWillingToMentor!: boolean;

  @ApiProperty({ description: 'Mentor bio', required: false })
  @IsOptional()
  @IsString()
  mentorBio?: string;

  @ApiProperty({ description: 'Hourly rate', required: false })
  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @ApiProperty({
    description: 'Areas of expertise',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise?: string[];

  @ApiProperty({ description: 'Industries', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @ApiProperty({ description: 'Availability description', required: false })
  @IsOptional()
  @IsString()
  availability?: string;

  @ApiProperty({ description: 'Response time', required: false })
  @IsOptional()
  @IsString()
  responseTime?: string;

  @ApiProperty({ description: 'Mentoring style', required: false })
  @IsOptional()
  @IsString()
  mentoringStyle?: string;

  @ApiProperty({
    description: 'Languages spoken',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

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
