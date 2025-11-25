import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({
    description: 'The content of the comment',
    example: 'This is a very insightful topic!',
    maxLength: 1000,
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: 'The ID of the topic to comment on',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  topicId!: string;

  @ApiPropertyOptional({
    description: 'The ID of the parent comment if this is a reply',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsString()
  parentCommentId?: string;

  @ApiPropertyOptional({
    description: 'Whether the comment should be posted anonymously',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;
}
