import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CommentReactionDto {
  @ApiProperty({
    description: 'The ID of the comment to react to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  commentId!: string;

  @ApiProperty({
    description: 'Type of reaction to add',
    enum: ['helpful', 'supportive'],
    example: 'helpful',
  })
  @IsEnum(['helpful', 'supportive'])
  reactionType!: 'helpful' | 'supportive';
}
