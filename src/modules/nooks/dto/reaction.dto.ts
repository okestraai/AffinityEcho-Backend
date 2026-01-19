import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';

export enum NookReactionType {
  HEARD = 'heard',
  VALIDATED = 'validated',
  INSPIRED = 'inspired',
}

export enum MessageReactionType {
  HEARD = 'heard',
  VALIDATED = 'validated',
  HELPFUL = 'helpful',
  SUPPORTIVE = 'supportive',
}

export class ReactionDto {
  @ApiProperty({
    description: 'Type of reaction',
    enum: [
      ...Object.values(NookReactionType),
      ...Object.values(MessageReactionType),
    ],
    example: NookReactionType.HEARD,
  })
  @IsString()
  @IsEnum([
    ...Object.values(NookReactionType),
    ...Object.values(MessageReactionType),
  ])
  reaction_type!: string;
}
