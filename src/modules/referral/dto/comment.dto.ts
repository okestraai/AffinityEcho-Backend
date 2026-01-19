import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'This looks like a great opportunity!' })
  @IsString()
  @MaxLength(1000)
  content!: string;
}
