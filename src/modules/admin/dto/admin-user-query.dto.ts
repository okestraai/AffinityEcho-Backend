import { IsIn, IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Filter by username (partial match)',
    example: 'john',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by role',
    enum: ['user', 'moderator', 'admin', 'super_admin'],
    example: 'moderator',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Filter by account status',
    enum: ['active', 'suspended', 'deactivated', 'deleted'],
    example: 'active',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['created_at', 'username', 'last_active_at'],
    example: 'created_at',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class AdminUserExportQueryDto {
  @ApiProperty({ enum: ['csv', 'pdf'], required: true })
  @IsIn(['csv', 'pdf'])
  format!: 'csv' | 'pdf';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    enum: ['user', 'moderator', 'admin', 'super_admin'],
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({
    required: false,
    enum: ['active', 'suspended', 'deactivated', 'deleted'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    required: false,
    enum: [
      'username',
      'email',
      'role',
      'created_at',
      'last_active_at',
      'total_posts',
      'total_comments',
      'reports_against',
    ],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}
