import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsUrl,
  IsIn,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AUDIENCES, Audience } from '../../spaces/spaces.constants';
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

  @ApiPropertyOptional({
    description:
      'Forum for the topic. Leave it out to post to Other topics in the space picked by audience.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  forumId?: string;

  @ApiPropertyOptional({
    description:
      'Who sees a topic posted without a forum. Ignored when a forum is given.',
    enum: AUDIENCES,
    default: 'everyone',
  })
  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: Audience;

  @ApiPropertyOptional({
    description: 'Optional short label, used to filter Other topics',
    example: 'visas',
    maxLength: 40,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @Length(1, 40)
  @Matches(/^[^,()]+$/, { message: 'Label cannot contain commas or brackets' })
  label?: string;

  @ApiPropertyOptional({
    description: 'Ignored: the space comes from the forum.',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Ignored: the scope comes from the forum.',
    enum: ['local', 'global'],
    deprecated: true,
  })
  @IsOptional()
  @IsEnum(['local', 'global'])
  scope?: 'local' | 'global';

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
