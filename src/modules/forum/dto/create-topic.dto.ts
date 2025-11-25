import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTopicDto {
  @ApiProperty({
    description: 'Title of the topic',
    example: 'How to navigate promotion conversations?',
    maxLength: 200,
  })
  @IsString()
  title!: string;

  @ApiProperty({
    description: 'Content/body of the topic',
    example:
      'Has anyone had success asking for a promotion during review cycles? Looking for specific strategies...',
    maxLength: 5000,
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'ID of the forum where the topic will be created',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  forumId!: string;

  @ApiPropertyOptional({
    description: 'Company name for company-specific topics',
    example: 'Google',
  })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({
    description: 'Scope of the topic visibility',
    enum: ['local', 'global'],
    example: 'local',
  })
  @IsEnum(['local', 'global'])
  scope!: 'local' | 'global';

  @ApiPropertyOptional({
    description: 'Whether the topic should be posted anonymously',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @ApiPropertyOptional({
    description: 'Tags for categorizing the topic',
    example: ['promotion', 'career-advancement', 'negotiation'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Affinity groups relevant to the topic',
    example: ['women-in-tech', 'black-professionals', 'first-gen'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affinityGroups?: string[];

  @ApiPropertyOptional({
    description: 'Optional link/URL related to the topic',
    example: 'https://example.com/article-about-promotions',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Link must be a valid URL' })
  link?: string;
}
