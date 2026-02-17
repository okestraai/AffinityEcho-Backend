import { IsString, IsOptional, IsEnum, IsArray, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PostVisibility {
  GLOBAL = 'global',
  COMPANY = 'company',
  CONNECTIONS = 'connections',
}

export class CreatePostDto {
  @ApiProperty({
    description: 'Post content',
    example: 'Just achieved a major milestone in my career! Feeling grateful for all the support.',
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
