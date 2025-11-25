import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumDto {
  @ApiProperty({
    description: 'Name of the forum',
    example: 'Career Growth',
    maxLength: 100,
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Description of the forum',
    example: 'Advancement strategies, promotion tips, and career development',
    maxLength: 500,
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Icon representing the forum',
    example: '📈',
  })
  @IsString()
  icon!: string;

  @ApiProperty({
    description: 'Whether the forum is global or company-specific',
    example: false,
  })
  @IsBoolean()
  isGlobal!: boolean;

  @ApiPropertyOptional({
    description: 'Company name (encrypted) if this is a company-specific forum',
    example: 'Google',
  })
  @IsOptional()
  @IsString()
  companyName?: string; // Changed from companyName to companyName

  @ApiProperty({
    description: 'Category of the forum',
    enum: ['foundation', 'company', 'global'],
    example: 'foundation',
  })
  @IsEnum(['foundation', 'company', 'global'])
  category!: 'foundation' | 'company' | 'global';

  @ApiPropertyOptional({
    description: 'Forum rules and guidelines',
    example: [
      'Be respectful and professional',
      'Share experiences honestly',
      'Support others constructively',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiPropertyOptional({
    description: 'List of moderator user IDs',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moderators?: string[];
}
