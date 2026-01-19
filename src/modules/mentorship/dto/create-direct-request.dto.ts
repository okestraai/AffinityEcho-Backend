import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDirectRequestDto {
  @ApiProperty({
    description: 'ID of the user to send request to',
    example: '52eb7df3-233b-4f1c-a825-1aa17ca204d9',
  })
  @IsString()
  targetUserId!: string;

  @ApiProperty({
    description: 'Type of request',
    enum: ['mentor_request', 'mentee_request'],
    example: 'mentor_request',
  })
  @IsEnum(['mentor_request', 'mentee_request'])
  requestType!: 'mentor_request' | 'mentee_request';

  @ApiProperty({
    description: 'Message to include with the request',
    example:
      'I would love to learn from your experience in software engineering!',
  })
  @IsString()
  message!: string;

  @ApiProperty({
    description: 'Topic or area of interest',
    required: false,
    example: 'Career Transition to Tech',
  })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty({
    description: 'Goals for the mentorship',
    required: false,
    example: 'Learn React, Get promotion, Build portfolio',
  })
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiProperty({
    description: 'Current job title',
    required: false,
    example: 'Software Engineer',
  })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiProperty({
    description: 'Current company',
    required: false,
    example: 'TechCorp Inc.',
  })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({
    description: 'Years of experience',
    required: false,
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  @ApiProperty({
    description: 'Location',
    required: false,
    example: 'San Francisco, CA',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({
    description: 'Career level',
    required: false,
    example: 'Mid-Level',
  })
  @IsOptional()
  @IsString()
  careerLevel?: string;

  @ApiProperty({
    description: 'Short bio or introduction',
    required: false,
    example: 'Passionate developer with 5 years of experience...',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}

export class RespondToDirectRequestDto {
  @ApiProperty({
    description: 'Action to take',
    enum: ['accept', 'decline', 'cancel'],
    example: 'accept',
  })
  @IsEnum(['accept', 'decline', 'cancel'])
  action!: 'accept' | 'decline' | 'cancel';

  @ApiProperty({
    description: 'Optional response message',
    required: false,
    example: 'Looking forward to working with you!',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

export class DirectRequestFilterDto {
  @ApiProperty({
    description: 'Filter by status',
    required: false,
    enum: ['pending', 'accepted', 'declined', 'cancelled'],
    example: 'pending',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    description: 'Filter by request type',
    required: false,
    enum: ['mentor_request', 'mentee_request'],
    example: 'mentor_request',
  })
  @IsOptional()
  @IsString()
  requestType?: string;

  @ApiProperty({
    description: 'Page number',
    required: false,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Items per page',
    required: false,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Mark fetched requests as read',
    required: false,
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  markAsRead?: boolean = false;
}
