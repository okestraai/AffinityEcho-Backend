import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminReportsService } from './services/admin-reports.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminForumsService } from './services/admin-forums.service';
import { AdminNooksService } from './services/admin-nooks.service';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminLogsService } from './services/admin-logs.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminPermissionsService } from './services/admin-permissions.service';
import {
  AdminUserQueryDto,
  AdminUserExportQueryDto,
} from './dto/admin-user-query.dto';
import {
  AdminReportExportQueryDto,
  AdminReportQueryDto,
} from './dto/admin-report-query.dto';
import {
  AdminModerationExportQueryDto,
  AdminModerationQueryDto,
} from './dto/admin-moderation-query.dto';
import { AdminForumQueryDto } from './dto/admin-forum-query.dto';
import { AdminLogQueryDto } from './dto/admin-log-query.dto';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminHealthService } from './services/admin-health.service';
import { Response } from 'express';

function ip(req: any): string | undefined {
  return (
    req.headers?.['x-forwarded-for']?.split(',')[0] ?? req.socket?.remoteAddress
  );
}

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private dashboard: AdminDashboardService,
    private users: AdminUsersService,
    private reports: AdminReportsService,
    private moderation: AdminModerationService,
    private forums: AdminForumsService,
    private nooks: AdminNooksService,
    private notifications: AdminNotificationsService,
    private logs: AdminLogsService,
    private settings: AdminSettingsService,
    private permissions: AdminPermissionsService,
    private analytics: AdminAnalyticsService,
    private health: AdminHealthService,
  ) {}

  // ─── 1. STATIC ROUTES FIRST ─────────────────────────────────────────────────

  @Get('dashboard')
  @UseGuards(PermissionGuard)
  @RequirePermission('dashboard:view')
  @ApiOperation({
    summary: 'Get admin dashboard overview',
    description:
      'Returns platform-wide stats. Requires admin or super_admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard overview stats',
    schema: {
      example: {
        users: { total: 1200, active: 980, suspended: 15, new_today: 8 },
        reports: {
          total: 340,
          pending: 12,
          under_review: 5,
          resolved: 310,
          high_priority: 3,
        },
        content: { posts: 4500, comments: 12000, hidden_today: 2 },
        forums: { total: 24, locked: 1 },
        nooks: { active: 87, expiring_soon: 4 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  getOverview() {
    return this.dashboard.getOverview();
  }

  @Get('export')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:export')
  @ApiOperation({
    summary: 'Export users data',
    description:
      'Export users list in CSV or PDF format with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:export permission',
  })
  @ApiResponse({ status: 400, description: 'Invalid format parameter' })
  @ApiResponse({ status: 404, description: 'No users found to export' })
  async exportUsers(
    @Query() query: AdminUserExportQueryDto,
    @Res() res: Response,
  ) {
    try {
      console.log('Export users endpoint called with query:', query);

      const result = await this.users.exportUsers(query);

      if (!result || !result.data) {
        throw new NotFoundException('No data available for export');
      }

      // Set appropriate headers based on format
      const contentType =
        query.format === 'csv' ? 'text/csv' : 'application/pdf';
      const fileName = `users_export_${new Date().toISOString().split('T')[0]}.${query.format}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      res.setHeader('Content-Length', result.data.length);

      return res.send(result.data);
    } catch (error) {
      console.error('Export error:', error);

      // Type guard for error
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle unknown error type
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Export failed: ${errorMessage}`);
    }
  }

  // ─── 1b. ADMIN PROFILE ──────────────────────────────────────────────────────

  @Get('profile')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get own admin profile',
    description:
      "Returns the authenticated admin's stored profile including first_name and last_name.",
  })
  @ApiResponse({
    status: 200,
    description: 'Admin profile',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          username: 'johndoe_admin',
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          avatar: null,
          role: 'admin',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-03-04T00:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getAdminProfile(@Req() req: any) {
    return this.users.getAdminProfile(req.user.userId);
  }

  @Patch('profile')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Update own admin profile',
    description:
      "Update the authenticated admin's first_name, last_name, or username.",
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        first_name: { type: 'string', example: 'John' },
        last_name: { type: 'string', example: 'Doe' },
        username: { type: 'string', example: 'johndoe_admin' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    schema: {
      example: {
        success: true,
        data: { id: 'uuid', username: 'johndoe_admin', role: 'admin' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Username already taken' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateAdminProfile(
    @Req() req: any,
    @Body()
    body: { first_name?: string; last_name?: string; username?: string },
  ) {
    return this.users.updateAdminProfile(req.user.userId, body);
  }

  // ─── 1c. SETTINGS ────────────────────────────────────────────────────────────

  @Get('settings')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Get system settings',
    description:
      'Returns all platform-wide settings (general, security, notifications, moderation). Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'System settings',
    schema: {
      example: {
        success: true,
        data: {
          general: {
            platform_name: 'AffinityEcho',
            platform_description: 'A professional social platform',
            maintenance_mode: false,
            allow_new_registrations: true,
            require_email_verification: true,
            support_email: 'support@affinityecho.com',
          },
          security: {
            max_login_attempts: 5,
            session_timeout_minutes: 60,
            require_2fa_for_admins: false,
            min_password_length: 8,
            password_requires_special_char: true,
            ip_whitelist_enabled: false,
            allowlist_ips: [],
          },
          notifications: {
            email_notifications_enabled: true,
            push_notifications_enabled: true,
            digest_frequency: 'daily',
            max_notifications_per_day: 50,
            email_on_new_report: true,
            email_on_new_user: false,
            email_on_flagged_content: true,
            push_on_new_report: true,
            push_on_new_user: false,
            push_on_flagged_content: true,
            report_alert_threshold: 5,
          },
          moderation: {
            auto_hide_reports_threshold: 3,
            require_reason_for_hiding: true,
            allow_user_appeals: true,
            auto_suspend_after_reports: 10,
            content_review_queue_enabled: true,
            spam_filter_strength: 'medium',
            content_retention_days: 365,
            report_auto_resolve_days: 30,
            require_review_for_new_users: false,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getSettings() {
    return this.settings.getSettings();
  }

  @Put('settings/:key')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary: 'Update a settings section',
    description:
      'Partially updates one settings section. Only super_admin can update settings.',
  })
  @ApiParam({
    name: 'key',
    description: 'Settings section key',
    enum: ['general', 'security', 'notifications', 'moderation'],
  })
  @ApiBody({
    schema: {
      type: 'object',
      description:
        'Partial settings object to merge into the existing section. Only provided keys are updated.',
      example: {
        maintenance_mode: true,
        support_email: 'support@affinityecho.com',
        ip_whitelist_enabled: true,
        allowlist_ips: ['192.168.1.0/24'],
        spam_filter_strength: 'high',
        report_alert_threshold: 3,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Settings updated',
    schema: { example: { success: true, data: { key: 'general', value: {} } } },
  })
  @ApiResponse({ status: 400, description: 'Invalid settings key' })
  @ApiResponse({ status: 403, description: 'Forbidden — super_admin only' })
  updateSettings(
    @Req() req: any,
    @Param('key') key: string,
    @Body() body: Record<string, any>,
  ) {
    return this.settings.updateSettings(
      req.user.userId,
      req.user.username,
      key as any,
      body,
      ip(req),
    );
  }

  // ─── 1d. PERMISSION MANAGEMENT (super_admin only) ────────────────────────────

  @Get('admins/:adminId/permissions')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary: 'Get admin permissions',
    description:
      'Returns the permission set for a specific admin or moderator user. Only super_admin can access.',
  })
  @ApiParam({ name: 'adminId', description: 'Admin user UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin permissions',
    schema: {
      example: {
        success: true,
        data: {
          admin_id: 'uuid',
          username: 'admin_user',
          role: 'admin',
          permissions: ['users:view', 'users:suspend', 'reports:view'],
          granted_by: 'super-admin-uuid',
          updated_at: '2026-03-01T00:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden — super_admin only' })
  @ApiResponse({ status: 404, description: 'User not found or not an admin' })
  getAdminPermissions(@Param('adminId') adminId: string) {
    return this.permissions.getAdminPermissions(adminId);
  }

  @Put('admins/:adminId/permissions')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary: 'Update admin permissions',
    description:
      'Replaces the full permission set for an admin or moderator. Only super_admin can modify permissions.',
  })
  @ApiParam({ name: 'adminId', description: 'Admin user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['permissions'],
      properties: {
        permissions: {
          type: 'array',
          items: { type: 'string' },
          example: [
            'users:view',
            'users:suspend',
            'reports:view',
            'reports:update',
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Permissions updated',
    schema: {
      example: {
        success: true,
        data: {
          admin_id: 'uuid',
          permissions: ['users:view', 'users:suspend'],
          granted_by: 'super-admin-uuid',
          updated_at: '2026-03-04T00:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid permission key(s)' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — super_admin only or cannot modify super_admin',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateAdminPermissions(
    @Req() req: any,
    @Param('adminId') adminId: string,
    @Body() body: { permissions: string[] },
  ) {
    return this.permissions.updateAdminPermissions(
      req.user.userId,
      req.user.username,
      adminId,
      body.permissions,
      ip(req),
    );
  }

  // ─── 2. USERS ROUTES (SPECIFIC BEFORE PARAMETERIZED) ─────────────────────────

  @Get('users')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:view')
  @ApiOperation({
    summary: 'List users',
    description:
      'Paginated, filterable user list. Requires users:view permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list',
    schema: {
      example: {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            username: 'john_doe',
            email: 'john@example.com',
            role: 'user',
            is_suspended: false,
            created_at: '2026-01-01T00:00:00Z',
            last_active_at: '2026-02-20T10:00:00Z',
          },
        ],
        total: 1200,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:view permission',
  })
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.users.listUsers(query);
  }

  @Get('users/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:view_detail')
  @ApiOperation({
    summary: 'Get user detail',
    description:
      'Full profile, suspension history, and recent reports for a user.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Target user UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'User detail',
    schema: {
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        username: 'john_doe',
        email: 'john@example.com',
        role: 'user',
        is_suspended: false,
        suspension_reason: null,
        suspension_expires_at: null,
        created_at: '2026-01-01T00:00:00Z',
        reports_against: [],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserDetail(@Param('userId') userId: string) {
    return this.users.getUserDetail(userId);
  }

  @Patch('users/:userId/suspend')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:suspend')
  @ApiOperation({
    summary: 'Suspend a user',
    description:
      'Sets is_suspended = true and records an audit log. Requires users:suspend permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Repeated harassment violations' },
        expires_at: {
          type: 'string',
          format: 'date-time',
          example: '2026-03-01T00:00:00Z',
          nullable: true,
          description: 'Omit for indefinite suspension',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User suspended' })
  @ApiResponse({
    status: 400,
    description: 'Invalid request — reason required',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:suspend permission',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  suspendUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { reason: string; expires_at?: string },
  ) {
    return this.users.suspendUser(
      req.user.userId,
      req.user.username,
      req.user.role,
      userId,
      body.reason,
      body.expires_at,
      ip(req),
    );
  }

  @Patch('users/:userId/unsuspend')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:suspend')
  @ApiOperation({
    summary: 'Unsuspend a user',
    description:
      'Clears suspension and records an audit log. Requires users:suspend permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'Appeal approved',
          description: 'Defaults to "Appeal approved" if omitted',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User unsuspended' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:suspend permission',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  unsuspendUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.users.unsuspendUser(
      req.user.userId,
      req.user.username,
      userId,
      body.reason ?? 'Appeal approved',
      ip(req),
    );
  }

  @Patch('users/:userId/role')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:change_role')
  @ApiOperation({
    summary: 'Change user role',
    description:
      'Promotes or demotes a user role. Admins can assign up to "admin"; only super_admin can assign "super_admin".',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['role'],
      properties: {
        role: {
          type: 'string',
          enum: ['user', 'moderator', 'admin', 'super_admin'],
          example: 'moderator',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:change_role permission',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  changeRole(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    return this.users.changeRole(
      req.user.userId,
      req.user.username,
      req.user.role,
      userId,
      body.role,
      ip(req),
    );
  }

  @Delete('users/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user account',
    description:
      'Soft-deletes the account and records an audit log. Requires users:delete permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'TOS violation — CSAM' },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'User deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:delete permission',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  deleteUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { reason: string },
  ) {
    return this.users.deleteUser(
      req.user.userId,
      req.user.username,
      req.user.role,
      userId,
      body.reason,
      ip(req),
    );
  }

  @Post('users/:userId/notify')
  @UseGuards(PermissionGuard)
  @RequirePermission('users:notify')
  @ApiOperation({
    summary: 'Send a direct notification to a user',
    description:
      'Delivers an in-app notification to the target user and records an audit log.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'message'],
      properties: {
        title: { type: 'string', example: 'Community Guidelines Reminder' },
        message: {
          type: 'string',
          example:
            'Your recent post violated our community guidelines regarding harassment.',
        },
        type: {
          type: 'string',
          enum: ['system', 'warning', 'info'],
          default: 'system',
          example: 'warning',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires users:notify permission',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  notifyUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { title: string; message: string; type?: string },
  ) {
    return this.users.notifyUser(
      req.user.userId,
      req.user.username,
      userId,
      body.title,
      body.message,
      body.type ?? 'system',
      ip(req),
    );
  }

  // ─── 3. SPECIFIC RESOURCE ROUTES ───────────────────────────────────────────

  // ─── Reports ────────────────────────────────────────────────────────────────

  @Get('reports')
  @UseGuards(PermissionGuard)
  @RequirePermission('reports:view')
  @ApiOperation({
    summary: 'List harassment reports',
    description:
      'Paginated, filterable report list. Use assignedTo=me to see your queue.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated report list',
    schema: {
      example: {
        data: [
          {
            id: 'report-uuid',
            status: 'submitted',
            type: 'Sexual harassment',
            immediate_risk: false,
            assigned_to: null,
            created_at: '2026-02-01T12:00:00Z',
            reporter: { id: 'uuid', username: 'reporter_user' },
            reported_user: { id: 'uuid', username: 'target_user' },
          },
        ],
        total: 48,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listReports(@Req() req: any, @Query() query: AdminReportQueryDto) {
    return this.reports.listReports(req.user.userId, query);
  }

  @Get('reports/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('reports:export')
  @ApiOperation({
    summary: 'Export harassment reports',
    description:
      'Export reports list in CSV or PDF format with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  async exportReports(
    @Req() req: any,
    @Query() query: AdminReportExportQueryDto,
    @Res() res: Response,
  ) {
    try {
      const format = query.format || 'csv';
      const result = await this.reports.exportReports(
        req.user.userId,
        query,
        format,
      );

      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader('Content-Length', result.buffer.length);

      return res.send(result.buffer);
    } catch (error) {
      console.error('Export reports error:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Export failed: ${errorMessage}`);
    }
  }

  @Get('reports/:reportId')
  @UseGuards(PermissionGuard)
  @RequirePermission('reports:view_detail')
  @ApiOperation({
    summary: 'Get report detail',
    description: 'Full report with timeline events and related content.',
  })
  @ApiParam({ name: 'reportId', description: 'Report UUID' })
  @ApiResponse({
    status: 200,
    description: 'Report detail',
    schema: {
      example: {
        id: 'report-uuid',
        status: 'under_review',
        type: 'Sexual harassment',
        description: 'User repeatedly harassed me in the forum.',
        immediate_risk: false,
        admin_notes: 'Reviewing chat logs.',
        assigned_to: 'moderator-uuid',
        resolution_action: null,
        created_at: '2026-02-01T12:00:00Z',
        timeline: [
          { event: 'submitted', at: '2026-02-01T12:00:00Z', by: null },
          { event: 'assigned', at: '2026-02-02T09:00:00Z', by: 'mod_username' },
        ],
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  getReportDetail(@Param('reportId') reportId: string) {
    return this.reports.getReportDetail(reportId);
  }

  @Patch('reports/:reportId')
  @UseGuards(PermissionGuard)
  @RequirePermission('reports:update')
  @ApiOperation({
    summary: 'Update a report',
    description:
      'Update status, resolution action, admin notes, or assignee in a single call.',
  })
  @ApiParam({ name: 'reportId', description: 'Report UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['submitted', 'under_review', 'resolved', 'declined'],
          example: 'resolved',
        },
        resolution_action: {
          type: 'string',
          example: 'User suspended for 7 days.',
        },
        admin_notes: {
          type: 'string',
          example: 'Reviewed message logs. Harassment confirmed.',
        },
        assigned_to: {
          type: 'string',
          nullable: true,
          example: 'moderator-uuid',
          description: 'Pass null to unassign',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Report updated',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  updateReport(
    @Req() req: any,
    @Param('reportId') reportId: string,
    @Body()
    body: {
      status?: string;
      resolution_action?: string;
      admin_notes?: string;
      assigned_to?: string | null;
    },
  ) {
    return this.reports.updateReport(
      req.user.userId,
      req.user.username,
      reportId,
      body,
      ip(req),
    );
  }

  @Post('reports/:reportId/assign')
  @UseGuards(PermissionGuard)
  @RequirePermission('reports:assign')
  @ApiOperation({
    summary: 'Assign report to self',
    description: "Sets assigned_to to the current admin's user ID.",
  })
  @ApiParam({ name: 'reportId', description: 'Report UUID' })
  @ApiResponse({
    status: 200,
    description: 'Report assigned to current user',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  assignToSelf(@Req() req: any, @Param('reportId') reportId: string) {
    return this.reports.assignToSelf(
      req.user.userId,
      req.user.username,
      reportId,
      ip(req),
    );
  }

  // ─── Content Moderation ─────────────────────────────────────────────────────
  @Get('content/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('content:export')
  @ApiOperation({
    summary: 'Export content moderation data',
    description:
      'Export content list in CSV or PDF format with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  async exportContent(
    @Query() query: AdminModerationExportQueryDto,
    @Res() res: Response,
  ) {
    try {
      const format = query.format || 'csv';
      const result = await this.moderation.exportContent(query, format);

      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader('Content-Length', result.buffer.length);

      return res.send(result.buffer);
    } catch (error) {
      console.error('Export content error:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Export failed: ${errorMessage}`);
    }
  }

  @Get('content')
  @UseGuards(PermissionGuard)
  @RequirePermission('content:view')
  @ApiOperation({
    summary: 'List moderated content',
    description:
      'Paginated list of posts, comments, and nook messages. Filter by type, status, or flagged.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated content list',
    schema: {
      example: {
        data: {
          summary: {
            total: 1500,
            active: 1450,
            visible: 1400,
            hidden: 50,
            removed: 50,
            flagged: 25,
          },
          items: [
            {
              id: 'cm-uuid',
              type: 'feed_post',
              content_id: 'post-uuid',
              moderation_status: 'hidden',
              moderation_reason: 'Hate speech',
              reports_count: 3,
              moderated_at: '2026-02-10T08:00:00Z',
              preview: 'The first 200 chars of the post...',
              author: {
                id: 'uuid',
                username: 'author_user',
                avatar: 'avatar_url',
              },
              moderated_by: { id: 'mod-uuid', username: 'mod_user' },
            },
          ],
        },
        meta: { total: 1500, page: 1, limit: 20 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listContent(@Query() query: AdminModerationQueryDto) {
    return this.moderation.listContent(query);
  }

  @Get('content/:contentType/:contentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('content:view_detail')
  @ApiOperation({
    summary: 'Get content detail',
    description: 'Get full details of a specific content item.',
  })
  @ApiParam({
    name: 'contentType',
    description: 'Content type',
    enum: [
      'feed_post',
      'feed_comment',
      'forum_topic',
      'forum_comment',
      'nook',
      'nook_message',
    ],
  })
  @ApiParam({ name: 'contentId', description: 'Content UUID' })
  @ApiResponse({
    status: 200,
    description: 'Content detail',
    schema: {
      example: {
        success: true,
        data: {
          id: 'cm-uuid',
          type: 'feed_post',
          content_id: 'post-uuid',
          content: 'Full content text here...',
          moderation_status: 'hidden',
          moderation_reason: 'Hate speech',
          reports_count: 3,
          author: {
            id: 'uuid',
            username: 'author_user',
            avatar: 'avatar_url',
            email: 'user@example.com',
          },
          moderated_by: { id: 'mod-uuid', username: 'mod_user' },
          created_at: '2026-02-01T12:00:00Z',
          moderated_at: '2026-02-10T08:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  getContentDetail(
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
  ) {
    return this.moderation.getContentDetail(contentType, contentId);
  }

  @Patch('content/:contentType/:contentId/hide')
  @UseGuards(PermissionGuard)
  @RequirePermission('content:hide')
  @ApiOperation({
    summary: 'Hide content',
    description:
      'Sets is_hidden = true on the source record and creates a content_moderation entry.',
  })
  @ApiParam({
    name: 'contentType',
    description: 'Content type',
    enum: [
      'feed_post',
      'feed_comment',
      'forum_topic',
      'forum_comment',
      'nook',
      'nook_message',
    ],
  })
  @ApiParam({ name: 'contentId', description: 'Content UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          example: 'Contains hate speech targeting a protected group.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Content hidden',
    schema: { example: { success: true, data: null } },
  })
  @ApiResponse({ status: 400, description: 'Invalid content_type' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  hideContent(
    @Req() req: any,
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body() body: { reason: string },
  ) {
    return this.moderation.hideContent(
      req.user.userId,
      req.user.username,
      contentType,
      contentId,
      body.reason,
      ip(req),
    );
  }

  @Patch('content/:contentType/:contentId/restore')
  @UseGuards(PermissionGuard)
  @RequirePermission('content:restore')
  @ApiOperation({
    summary: 'Restore hidden content',
    description:
      'Sets is_hidden = false and updates the content_moderation status to "visible".',
  })
  @ApiParam({
    name: 'contentType',
    description: 'Content type',
    enum: [
      'feed_post',
      'feed_comment',
      'forum_topic',
      'forum_comment',
      'nook',
      'nook_message',
    ],
  })
  @ApiParam({ name: 'contentId', description: 'Content UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'False positive — content does not violate guidelines.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Content restored',
    schema: { example: { success: true, data: null } },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  restoreContent(
    @Req() req: any,
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body() body: { reason?: string },
  ) {
    return this.moderation.restoreContent(
      req.user.userId,
      req.user.username,
      contentType,
      contentId,
      body.reason ?? '',
      ip(req),
    );
  }

  @Delete('content/:contentType/:contentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('content:remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete content',
    description:
      'Hard-deletes the source record. Irreversible. Requires content:remove permission.',
  })
  @ApiParam({
    name: 'contentType',
    description: 'Content type',
    enum: [
      'feed_post',
      'feed_comment',
      'forum_topic',
      'forum_comment',
      'nook',
      'nook_message',
    ],
  })
  @ApiParam({ name: 'contentId', description: 'Content UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          example: 'CSAM — immediate removal required.',
        },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Content permanently deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires content:remove permission',
  })
  @ApiResponse({ status: 404, description: 'Content not found' })
  deleteContent(
    @Req() req: any,
    @Param('contentType') contentType: string,
    @Param('contentId') contentId: string,
    @Body() body: { reason: string },
  ) {
    return this.moderation.deleteContent(
      req.user.userId,
      req.user.username,
      contentType,
      contentId,
      body.reason,
      ip(req),
    );
  }

  // ─── Forums ─────────────────────────────────────────────────────────────────

  @Get('forums/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('forums:export')
  @ApiOperation({
    summary: 'Export forums',
    description: 'Export forums list as CSV or PDF.',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportForums(
    @Query() query: { search?: string; type?: string; format?: 'csv' | 'pdf' },
    @Res() res: Response,
  ) {
    const format = query.format || 'csv';
    const result = await this.forums.exportForums(query, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  }

  @Get('forums')
  @UseGuards(PermissionGuard)
  @RequirePermission('forums:view')
  @ApiOperation({
    summary: 'List forums',
    description:
      'Paginated list of all forums including hidden and locked ones.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated forum list',
    schema: {
      example: {
        data: [
          {
            id: 'forum-uuid',
            name: 'Career Advice',
            scope: 'global',
            is_locked: false,
            is_hidden: false,
            topics_count: 120,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        total: 24,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listForums(@Query() query: AdminForumQueryDto) {
    return this.forums.listForums(query);
  }

  @Post('forums')
  @UseGuards(PermissionGuard)
  @RequirePermission('forums:create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a forum',
    description:
      'Creates a new global or company-scoped forum. Requires forums:create permission.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'scope'],
      properties: {
        name: { type: 'string', example: 'Mental Health Support' },
        description: {
          type: 'string',
          example: 'A safe space to discuss mental health topics.',
        },
        scope: {
          type: 'string',
          enum: ['global', 'company'],
          example: 'global',
        },
        company_id: {
          type: 'string',
          nullable: true,
          example: 'company-uuid',
          description: 'Required when scope = "company"',
        },
        icon: { type: 'string', example: '🧠' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          example: ['mental-health', 'wellness'],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Forum created',
    schema: { example: { id: 'forum-uuid', name: 'Mental Health Support' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires forums:create permission',
  })
  createForum(@Req() req: any, @Body() body: any) {
    return this.forums.createForum(
      req.user.userId,
      req.user.username,
      body,
      ip(req),
    );
  }

  @Patch('forums/:forumId')
  @UseGuards(PermissionGuard)
  @RequirePermission('forums:update')
  @ApiOperation({
    summary: 'Update a forum',
    description:
      'Update name, description, lock status, or visibility. Requires forums:update permission.',
  })
  @ApiParam({ name: 'forumId', description: 'Forum UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Updated Forum Name' },
        description: { type: 'string', example: 'Updated description.' },
        is_locked: { type: 'boolean', example: false },
        is_hidden: { type: 'boolean', example: false },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Forum updated',
    schema: { example: { success: true } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires forums:update permission',
  })
  @ApiResponse({ status: 404, description: 'Forum not found' })
  updateForum(
    @Req() req: any,
    @Param('forumId') forumId: string,
    @Body() body: any,
  ) {
    return this.forums.updateForum(
      req.user.userId,
      req.user.username,
      forumId,
      body,
      ip(req),
    );
  }

  @Delete('forums/:forumId')
  @UseGuards(PermissionGuard)
  @RequirePermission('forums:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a forum',
    description:
      'Soft-deletes the forum and records an audit log. Requires forums:delete permission.',
  })
  @ApiParam({ name: 'forumId', description: 'Forum UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          example: 'Forum no longer relevant — merged with another.',
        },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Forum deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires forums:delete permission',
  })
  @ApiResponse({ status: 404, description: 'Forum not found' })
  deleteForum(
    @Req() req: any,
    @Param('forumId') forumId: string,
    @Body() body: { reason: string },
  ) {
    return this.forums.deleteForum(
      req.user.userId,
      req.user.username,
      forumId,
      body.reason,
      ip(req),
    );
  }

  // ─── Nooks ──────────────────────────────────────────────────────────────────

  @Get('nooks/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('nooks:export')
  @ApiOperation({
    summary: 'Export nooks',
    description: 'Export nooks list as CSV or PDF.',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportNooks(
    @Query()
    query: {
      search?: string;
      scope?: string;
      is_locked?: string;
      format?: 'csv' | 'pdf';
    },
    @Res() res: Response,
  ) {
    const format = query.format || 'csv';
    const result = await this.nooks.exportNooks(query, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  }

  @Get('nooks')
  @UseGuards(PermissionGuard)
  @RequirePermission('nooks:view')
  @ApiOperation({
    summary: 'List nooks',
    description:
      'Paginated list of all nooks including hidden and expired ones. Requires nooks:view permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated nook list',
    schema: {
      example: {
        data: [
          {
            id: 'nook-uuid',
            name: 'Q1 2026 Planning',
            is_active: true,
            is_hidden: false,
            member_count: 8,
            expires_at: '2026-04-01T00:00:00Z',
            created_at: '2026-01-15T00:00:00Z',
          },
        ],
        total: 87,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires nooks:view permission',
  })
  listNooks(@Query() query: any) {
    return this.nooks.listNooks(query);
  }

  @Post('nooks')
  @UseGuards(PermissionGuard)
  @RequirePermission('nooks:create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a nook',
    description:
      'Creates a new nook and records an audit log. Requires nooks:create permission.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'HR Policy Review Group' },
        description: {
          type: 'string',
          example: 'Private group for reviewing the updated HR policy.',
        },
        expires_at: {
          type: 'string',
          format: 'date-time',
          example: '2026-06-01T00:00:00Z',
        },
        member_ids: {
          type: 'array',
          items: { type: 'string' },
          example: ['uuid-1', 'uuid-2'],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Nook created',
    schema: { example: { id: 'nook-uuid', name: 'HR Policy Review Group' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires nooks:create permission',
  })
  createNook(@Req() req: any, @Body() body: any) {
    return this.nooks.createNook(
      req.user.userId,
      req.user.username,
      body,
      ip(req),
    );
  }

  @Patch('nooks/:nookId')
  @UseGuards(PermissionGuard)
  @RequirePermission('nooks:update')
  @ApiOperation({
    summary: 'Update a nook',
    description:
      'Update nook name, description, expiry, or visibility. Requires nooks:update permission.',
  })
  @ApiParam({ name: 'nookId', description: 'Nook UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Updated Nook Name' },
        description: { type: 'string', example: 'Updated description.' },
        is_hidden: { type: 'boolean', example: false },
        expires_at: {
          type: 'string',
          format: 'date-time',
          example: '2026-07-01T00:00:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Nook updated',
    schema: { example: { success: true } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires nooks:update permission',
  })
  @ApiResponse({ status: 404, description: 'Nook not found' })
  updateNook(
    @Req() req: any,
    @Param('nookId') nookId: string,
    @Body() body: any,
  ) {
    return this.nooks.updateNook(
      req.user.userId,
      req.user.username,
      nookId,
      body,
      ip(req),
    );
  }

  @Delete('nooks/:nookId')
  @UseGuards(PermissionGuard)
  @RequirePermission('nooks:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a nook',
    description:
      'Soft-deletes the nook and records an audit log. Requires nooks:delete permission.',
  })
  @ApiParam({ name: 'nookId', description: 'Nook UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Nook created in error.' },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Nook deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires nooks:delete permission',
  })
  @ApiResponse({ status: 404, description: 'Nook not found' })
  deleteNook(
    @Req() req: any,
    @Param('nookId') nookId: string,
    @Body() body: { reason: string },
  ) {
    return this.nooks.deleteNook(
      req.user.userId,
      req.user.username,
      req.user.role,
      nookId,
      body.reason,
      ip(req),
    );
  }

  @Delete('nooks/:nookId/members/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermission('nooks:remove_member')
  @ApiOperation({
    summary: 'Remove a member from a nook',
    description:
      'Removes the specified user from the nook and records an audit log.',
  })
  @ApiParam({ name: 'nookId', description: 'Nook UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID to remove' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'User left the organization.' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Member removed',
    schema: { example: { success: true } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires nooks:remove_member permission',
  })
  @ApiResponse({ status: 404, description: 'Nook or member not found' })
  removeNookMember(
    @Req() req: any,
    @Param('nookId') nookId: string,
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.nooks.removeMember(
      req.user.userId,
      req.user.username,
      nookId,
      userId,
      body.reason ?? '',
      ip(req),
    );
  }

  // ─── Broadcast Notifications ─────────────────────────────────────────────────

  @Get('notifications/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications:export')
  @ApiOperation({
    summary: 'Export broadcast notifications',
    description: 'Export notification campaigns as CSV or PDF.',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportNotifications(
    @Query()
    query: {
      status?: string;
      audience?: string;
      type?: string;
      format?: 'csv' | 'pdf';
    },
    @Res() res: Response,
  ) {
    const format = query.format || 'csv';
    const result = await this.notifications.exportNotifications(query, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  }

  @Get('notifications')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications:view')
  @ApiOperation({
    summary: 'List broadcast notifications',
    description:
      'Returns admin-created broadcast notification campaigns. Requires notifications:view permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated broadcast notification list',
    schema: {
      example: {
        data: [
          {
            id: 'notif-uuid',
            title: 'Scheduled Maintenance',
            message:
              'The platform will be down for maintenance on Saturday from 2–4 AM UTC.',
            sent_at: null,
            created_at: '2026-02-20T10:00:00Z',
          },
        ],
        total: 5,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires notifications:view permission',
  })
  listNotifications(@Query() query: any) {
    return this.notifications.listNotifications(query);
  }

  @Post('notifications')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications:create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a broadcast notification',
    description:
      'Drafts a notification for later sending or sends immediately if send_now = true.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'message'],
      properties: {
        title: { type: 'string', example: 'Scheduled Maintenance' },
        message: {
          type: 'string',
          example: 'The platform will be down Saturday 2–4 AM UTC.',
        },
        send_now: {
          type: 'boolean',
          default: false,
          description: 'Set true to deliver immediately to all users',
        },
        target_role: {
          type: 'string',
          enum: ['all', 'moderator', 'admin'],
          default: 'all',
          example: 'all',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Notification created',
    schema: { example: { id: 'notif-uuid', title: 'Scheduled Maintenance' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires notifications:create permission',
  })
  createNotification(@Req() req: any, @Body() body: any) {
    return this.notifications.createNotification(
      req.user.userId,
      req.user.username,
      body,
      ip(req),
    );
  }

  @Post('notifications/:id/send')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications:send')
  @ApiOperation({
    summary: 'Send a broadcast notification',
    description:
      'Delivers a drafted notification to all target users immediately.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({
    status: 200,
    description: 'Notification sent',
    schema: { example: { success: true, recipients: 1200 } },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires notifications:send permission',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 409, description: 'Notification already sent' })
  sendNotification(@Req() req: any, @Param('id') id: string) {
    return this.notifications.sendNotification(
      req.user.userId,
      req.user.username,
      id,
      ip(req),
    );
  }

  @Delete('notifications/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a broadcast notification',
    description:
      'Deletes a draft notification. Cannot delete already-sent notifications.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires notifications:delete permission',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete a notification that has already been sent',
  })
  deleteNotification(@Req() req: any, @Param('id') id: string) {
    return this.notifications.deleteNotification(
      req.user.userId,
      req.user.username,
      id,
      ip(req),
    );
  }

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  @Get('logs/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('logs:export')
  @ApiOperation({
    summary: 'Export audit logs',
    description: 'Export admin audit logs as CSV or PDF.',
  })
  @ApiResponse({
    status: 200,
    description: 'File download',
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportLogs(
    @Query()
    query: {
      search?: string;
      adminId?: string;
      action?: string;
      targetType?: string;
      from?: string;
      to?: string;
      format?: 'csv' | 'pdf';
    },
    @Res() res: Response,
  ) {
    const format = query.format || 'csv';
    const result = await this.logs.exportLogs(query, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  }

  @Get('logs')
  @UseGuards(PermissionGuard)
  @RequirePermission('logs:view')
  @ApiOperation({
    summary: 'Get admin audit logs',
    description:
      'Paginated, filterable log of all admin actions. Requires logs:view permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit log list',
    schema: {
      example: {
        data: [
          {
            id: 'log-uuid',
            action: 'suspend_user',
            admin_id: 'admin-uuid',
            admin_username: 'admin_user',
            target_type: 'user',
            target_id: 'target-uuid',
            reason: 'Repeated harassment',
            metadata: { expires_at: '2026-03-01T00:00:00Z' },
            ip_address: '192.168.1.1',
            created_at: '2026-02-15T09:30:00Z',
          },
        ],
        total: 512,
        page: 1,
        limit: 10,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires logs:view permission',
  })
  getLogs(@Query() query: AdminLogQueryDto) {
    return this.logs.getLogs(query);
  }

  // ─── ANALYTICS ──────────────────────────────────────────────────────────────

  @Get('analytics')
  @UseGuards(PermissionGuard)
  @RequirePermission('analytics:view')
  @ApiOperation({
    summary:
      'Full analytics dashboard — signups, engagement, retention, moderation',
  })
  @ApiResponse({ status: 200, description: 'Analytics data returned' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires analytics:view permission',
  })
  getAnalytics() {
    return this.analytics.getAnalytics();
  }

  @Get('analytics/funnel')
  @UseGuards(PermissionGuard)
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'User funnel — signup to engagement milestones' })
  @ApiResponse({ status: 200, description: 'Funnel data returned' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires analytics:view permission',
  })
  getFunnel() {
    return this.analytics.getFunnel();
  }

  @Get('analytics/growth')
  @UseGuards(PermissionGuard)
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Growth charts — 30/60/90 day trends' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['30', '60', '90'],
    description: 'Chart period in days',
  })
  @ApiResponse({ status: 200, description: 'Growth data returned' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires analytics:view permission',
  })
  getGrowth(@Query('period') period?: '30' | '60' | '90') {
    return this.analytics.getGrowth(period || '30');
  }

  @Get('analytics/top-content')
  @UseGuards(PermissionGuard)
  @RequirePermission('analytics:view')
  @ApiOperation({
    summary:
      'Top content — most liked posts, most discussed topics, power users',
  })
  @ApiResponse({ status: 200, description: 'Top content data returned' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires analytics:view permission',
  })
  getTopContent() {
    return this.analytics.getTopContent();
  }

  // ─── HEALTH MONITORING ──────────────────────────────────────────────────────

  @Get('health')
  @UseGuards(PermissionGuard)
  @RequirePermission('health:view')
  @ApiOperation({
    summary:
      'Live module health check — database, auth, feeds, messaging, etc. Shows resolution steps for down modules.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Health status returned with resolution guidance for any down modules',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires health:view permission',
  })
  getHealth() {
    return this.health.getHealth();
  }

  @Get('health/history')
  @UseGuards(PermissionGuard)
  @RequirePermission('health:view')
  @ApiOperation({
    summary: 'Health check history — last 24 hours with uptime percentages',
  })
  @ApiResponse({ status: 200, description: 'Health history returned' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires health:view permission',
  })
  getHealthHistory() {
    return this.health.getHistory();
  }
}
