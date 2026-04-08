import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeedCommentDto {
  @ApiProperty({
    description: 'Comment content',
    example: 'Great post! This really resonates with me.',
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @ApiProperty({
    description: 'Parent comment ID for replies',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;

  @ApiProperty({
    description: 'Whether to comment anonymously',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
