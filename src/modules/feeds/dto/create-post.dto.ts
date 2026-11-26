import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';
import { AUDIENCES, Audience } from '../../spaces/spaces.constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PostVisibility {
  GLOBAL = 'global',
  COMPANY = 'company',
  CONNECTIONS = 'connections',
}

export class CreatePostDto {
  @ApiProperty({
    description: 'Post content',
    example:
      'Just achieved a major milestone in my career! Feeling grateful for all the support.',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @ApiProperty({
    description: 'Post visibility scope',
    enum: PostVisibility,
    default: PostVisibility.GLOBAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @ApiPropertyOptional({
    description:
      'Who sees it: everyone, your company or Students. When sent, it decides the space.',
    enum: AUDIENCES,
  })
  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: Audience;

  @ApiProperty({
    description: 'Whether to post anonymously',
    default: false,
    required: false,
  })
  @IsOptional()
  isAnonymous?: boolean;

  @ApiProperty({
    description: 'Tags for the post',
    example: ['career', 'achievement'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
