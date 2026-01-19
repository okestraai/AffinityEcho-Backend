import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsIn, IsObject } from 'class-validator';

export class RelationshipUpdateDto {
  @ApiProperty({
    description: 'Type of update',
    enum: ['contact', 'frequency', 'goals', 'general'],
  })
  @IsString()
  @IsIn(['contact', 'frequency', 'goals', 'general'])
  action!: string;

  @ApiProperty({ description: 'Meeting frequency', required: false })
  @IsOptional()
  @IsString()
  meetingFrequency?: string;

  @ApiProperty({
    description: 'Next session date and time',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  nextSessionAt?: string;

  @ApiProperty({ description: 'Notes about contact', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Updated mentee goals', required: false })
  @IsOptional()
  @IsString()
  menteeGoals?: string;

  @ApiProperty({
    description: 'Updated mentor skills',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentorSkills?: string[];

  @ApiProperty({
    description: 'General updates (for action=general)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  generalUpdates?: Record<string, any>;
}
