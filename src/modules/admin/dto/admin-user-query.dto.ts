import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional() @IsNumberString() page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional() @IsNumberString() limit?: string;

  @ApiPropertyOptional({ description: 'Filter by username (partial match)', example: 'john' })
  @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({
    description: 'Filter by role',
    enum: ['user', 'moderator', 'admin', 'super_admin'],
    example: 'moderator',
  })
  @IsOptional() @IsString() role?: string;

  @ApiPropertyOptional({
    description: 'Filter by account status',
    enum: ['active', 'suspended', 'deactivated', 'deleted'],
    example: 'active',
  })
  @IsOptional() @IsString() status?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['created_at', 'username', 'last_active_at'],
    example: 'created_at',
  })
  @IsOptional() @IsString() sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional() @IsString() sortOrder?: string;
}
