import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TopicReactionDto {
  @ApiProperty({
    description: 'The ID of the topic to react to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  topicId!: string;

  @ApiProperty({
    description: 'Type of reaction to add/remove',
    enum: ['seen', 'validated', 'inspired', 'heard'],
    example: 'seen',
  })
  @IsEnum(['seen', 'validated', 'inspired', 'heard'])
  reactionType!: 'seen' | 'validated' | 'inspired' | 'heard';
}
