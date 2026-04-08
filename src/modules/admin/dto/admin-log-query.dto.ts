import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminLogQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Items per page (default 10, max 200)',
    example: 10,
  })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Search admin username, action, or reason',
    example: 'suspend',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by admin user UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  adminId?: string;

  @ApiPropertyOptional({
    description: 'Filter by exact action name',
    example: 'suspend_user',
    enum: [
      'suspend_user',
      'unsuspend_user',
      'change_role',
      'delete_user',
      'notify_user',
      'update_report',
      'assign_report',
      'hide_content',
      'restore_content',
      'remove_content',
      'pin_topic',
      'unpin_topic',
      'lock_topic',
      'unlock_topic',
      'create_forum',
      'update_forum',
      'lock_forum',
      'unlock_forum',
      'hide_forum',
      'unhide_forum',
      'delete_forum',
      'create_nook',
      'update_nook',
      'delete_nook',
      'remove_nook_member',
      'broadcast_notification',
      'delete_notification',
    ],
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter by target entity type',
    enum: ['user', 'report', 'forum', 'nook', 'notification', 'forum_topic'],
    example: 'user',
  })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({
    description: 'ISO datetime lower bound (logs on or after this date)',
    example: '2026-02-01T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    description: 'ISO datetime upper bound (logs on or before this date)',
    example: '2026-02-28T23:59:59Z',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsString()
  sortDir?: string;
}
