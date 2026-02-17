import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ShareFeedItemDto {
  @ApiProperty({
    description: 'Optional message to add when sharing',
    example: 'This is exactly what I needed to hear today!',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shareMessage?: string;
}
