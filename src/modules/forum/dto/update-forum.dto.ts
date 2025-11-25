import { PartialType } from '@nestjs/mapped-types';
import { CreateForumDto } from './create-forum.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateForumDto extends PartialType(CreateForumDto) {
  @ApiPropertyOptional({
    description: 'Name of the forum',
    example: 'Career Growth & Development',
    maxLength: 100,
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Description of the forum',
    example:
      'Advancement strategies, promotion tips, career development, and mentorship',
    maxLength: 500,
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Icon representing the forum',
    example: '🚀',
  })
  icon?: string;

  @ApiPropertyOptional({
    description: 'Whether the forum is global or company-specific',
    example: false,
  })
  isGlobal?: boolean;

  @ApiPropertyOptional({
    description: 'Company ID if this is a company-specific forum',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Category of the forum',
    enum: ['foundation', 'company', 'global'],
    example: 'foundation',
  })
  category?: 'foundation' | 'company' | 'global';

  @ApiPropertyOptional({
    description: 'Forum rules and guidelines',
    example: [
      'Be respectful and professional in all interactions',
      'Share experiences honestly while maintaining privacy',
      'Support others and contribute constructively',
    ],
    type: [String],
  })
  rules?: string[];

  @ApiPropertyOptional({
    description: 'List of moderator user IDs',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
    type: [String],
  })
  moderators?: string[];
}
