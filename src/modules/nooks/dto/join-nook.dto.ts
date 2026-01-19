import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class JoinNookDto {
  @ApiProperty({
    description: 'Whether to join anonymously',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean = true;

  @ApiProperty({
    description: 'Whether to enable notifications',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  notifications_enabled?: boolean = true;
}
