import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryNotificationDto {
  @ApiProperty({ example: false, required: false, description: 'Filter by read status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_read?: boolean;

  @ApiProperty({
    example: 'mentorship_request',
    required: false,
    description: 'Filter by notification type',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ example: false, required: false, description: 'Group notifications by type and reference' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  grouped?: boolean;

  @ApiProperty({ example: 1, default: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 20, default: 20, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
