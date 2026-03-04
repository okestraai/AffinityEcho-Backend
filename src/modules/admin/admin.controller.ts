import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ModeratorGuard } from '../../common/guards/moderator.guard';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminReportsService } from './services/admin-reports.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminForumsService } from './services/admin-forums.service';
import { AdminNooksService } from './services/admin-nooks.service';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminLogsService } from './services/admin-logs.service';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminReportQueryDto } from './dto/admin-report-query.dto';
import { AdminModerationQueryDto } from './dto/admin-moderation-query.dto';
import { AdminForumQueryDto } from './dto/admin-forum-query.dto';
import { AdminLogQueryDto } from './dto/admin-log-query.dto';

function ip(req: any): string | undefined {
  return req.headers?.['x-forwarded-for']?.split(',')[0] ?? req.socket?.remoteAddress;
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
  ) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin dashboard overview', description: 'Returns platform-wide stats. Requires admin or super_admin role.' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard overview stats',
    schema: {
      example: {
        users: { total: 1200, active: 980, suspended: 15, new_today: 8 },
        reports: { total: 340, pending: 12, under_review: 5, resolved: 310, high_priority: 3 },
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

  // ─── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'List users', description: 'Paginated, filterable user list. Requires moderator or higher role.' })
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
  @ApiResponse({ status: 403, description: 'Forbidden — moderator role required' })
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.users.listUsers(query);
  }

  @Get('users/:userId')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Get user detail', description: 'Full profile, suspension history, and recent reports for a user.' })
  @ApiParam({ name: 'userId', description: 'Target user UUID', example: '123e4567-e89b-12d3-a456-426614174000' })
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
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Suspend a user', description: 'Sets is_suspended = true and records an audit log. Requires admin role.' })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Repeated harassment violations' },
        expires_at: { type: 'string', format: 'date-time', example: '2026-03-01T00:00:00Z', nullable: true, description: 'Omit for indefinite suspension' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User suspended', schema: { example: { success: true } } })
  @ApiResponse({ status: 400, description: 'Invalid request — reason required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  suspendUser(@Req() req: any, @Param('userId') userId: string, @Body() body: { reason: string; expires_at?: string }) {
    return this.users.suspendUser(req.user.userId, req.user.username, req.user.role, userId, body.reason, body.expires_at, ip(req));
  }

  @Patch('users/:userId/unsuspend')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Unsuspend a user', description: 'Clears suspension and records an audit log. Requires admin role.' })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'Appeal approved', description: 'Defaults to "Appeal approved" if omitted' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User unsuspended', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  unsuspendUser(@Req() req: any, @Param('userId') userId: string, @Body() body: { reason?: string }) {
    return this.users.unsuspendUser(req.user.userId, req.user.username, userId, body.reason ?? 'Appeal approved', ip(req));
  }

  @Patch('users/:userId/role')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Change user role', description: 'Promotes or demotes a user role. Admins can assign up to "admin"; only super_admin can assign "super_admin".' })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['role'],
      properties: {
        role: { type: 'string', enum: ['user', 'moderator', 'admin', 'super_admin'], example: 'moderator' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Role updated', schema: { example: { success: true, role: 'moderator' } } })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role to assign target role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  changeRole(@Req() req: any, @Param('userId') userId: string, @Body() body: { role: string }) {
    return this.users.changeRole(req.user.userId, req.user.username, req.user.role, userId, body.role, ip(req));
  }

  @Delete('users/:userId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user account', description: 'Soft-deletes the account and records an audit log. Requires admin role.' })
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
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  deleteUser(@Req() req: any, @Param('userId') userId: string, @Body() body: { reason: string }) {
    return this.users.deleteUser(req.user.userId, req.user.username, req.user.role, userId, body.reason, ip(req));
  }

  @Post('users/:userId/notify')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Send a direct notification to a user', description: 'Delivers an in-app notification to the target user and records an audit log.' })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'message'],
      properties: {
        title: { type: 'string', example: 'Community Guidelines Reminder' },
        message: { type: 'string', example: 'Your recent post violated our community guidelines regarding harassment.' },
        type: { type: 'string', enum: ['system', 'warning', 'info'], default: 'system', example: 'warning' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Notification sent', schema: { example: { success: true, notification_id: 'uuid' } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  notifyUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { title: string; message: string; type?: string },
  ) {
    return this.users.notifyUser(req.user.userId, req.user.username, userId, body.title, body.message, body.type ?? 'system', ip(req));
  }

  // ─── Reports ────────────────────────────────────────────────────────────────

  @Get('reports')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'List harassment reports', description: 'Paginated, filterable report list. Use assignedTo=me to see your queue.' })
  @ApiResponse({
    status: 200,
    description: 'Paginated report list',
    schema: {
      example: {
        data: [
          {
            id: 'report-uuid',
            status: 'submitted',
            type: 'verbal',
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

  @Get('reports/:reportId')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Get report detail', description: 'Full report with timeline events and related content.' })
  @ApiParam({ name: 'reportId', description: 'Report UUID' })
  @ApiResponse({
    status: 200,
    description: 'Report detail',
    schema: {
      example: {
        id: 'report-uuid',
        status: 'under_review',
        type: 'verbal',
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
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Update a report', description: 'Update status, resolution action, admin notes, or assignee in a single call.' })
  @ApiParam({ name: 'reportId', description: 'Report UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['submitted', 'under_review', 'resolved', 'declined'], example: 'resolved' },
        resolution_action: { type: 'string', example: 'User suspended for 7 days.' },
        admin_notes: { type: 'string', example: 'Reviewed message logs. Harassment confirmed.' },
        assigned_to: { type: 'string', nullable: true, example: 'moderator-uuid', description: 'Pass null to unassign' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Report updated', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  updateReport(
    @Req() req: any,
    @Param('reportId') reportId: string,
    @Body() body: { status?: string; resolution_action?: string; admin_notes?: string; assigned_to?: string | null },
  ) {
    return this.reports.updateReport(req.user.userId, req.user.username, reportId, body, ip(req));
  }

  @Post('reports/:reportId/assign')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Assign report to self', description: 'Sets assigned_to to the current moderator\'s user ID.' })
  @ApiParam({ name: 'reportId', description: 'Report UUID' })
  @ApiResponse({ status: 200, description: 'Report assigned to current user', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  assignToSelf(@Req() req: any, @Param('reportId') reportId: string) {
    return this.reports.assignToSelf(req.user.userId, req.user.username, reportId, ip(req));
  }

  // ─── Content Moderation ─────────────────────────────────────────────────────

  @Get('content')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'List moderated content', description: 'Paginated list of posts, comments, and nook messages. Filter by type, status, or flagged.' })
  @ApiResponse({
    status: 200,
    description: 'Paginated content list',
    schema: {
      example: {
        data: [
          {
            id: 'cm-uuid',
            content_type: 'post',
            content_id: 'post-uuid',
            status: 'hidden',
            reason: 'Hate speech',
            hidden_at: '2026-02-10T08:00:00Z',
            preview: 'The first 200 chars of the post...',
            author: { id: 'uuid', username: 'author_user' },
          },
        ],
        total: 34,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  listContent(@Query() query: AdminModerationQueryDto) {
    return this.moderation.listContent(query);
  }

  @Patch('content/:id/hide')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Hide content', description: 'Sets is_hidden = true on the source record and creates a content_moderation entry.' })
  @ApiParam({ name: 'id', description: 'Content UUID (post, comment, or nook_message ID)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['content_type', 'reason'],
      properties: {
        content_type: { type: 'string', enum: ['post', 'comment', 'nook_message'], example: 'post' },
        reason: { type: 'string', example: 'Contains hate speech targeting a protected group.' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Content hidden', schema: { example: { success: true } } })
  @ApiResponse({ status: 400, description: 'Invalid content_type' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  hideContent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { content_type: string; reason: string },
  ) {
    return this.moderation.hideContent(req.user.userId, req.user.username, body.content_type, id, body.reason, ip(req));
  }

  @Patch('content/:id/restore')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Restore hidden content', description: 'Sets is_hidden = false and updates the content_moderation status to "visible".' })
  @ApiParam({ name: 'id', description: 'Content moderation record UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', example: 'False positive — content does not violate guidelines.' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Content restored', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  restoreContent(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.moderation.restoreContent(req.user.userId, req.user.username, id, body.reason ?? '', ip(req));
  }

  @Delete('content/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete content', description: 'Hard-deletes the source record. Irreversible. Requires admin role.' })
  @ApiParam({ name: 'id', description: 'Content moderation record UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'CSAM — immediate removal required.' },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Content permanently deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  deleteContent(@Req() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.moderation.deleteContent(req.user.userId, req.user.username, id, body.reason, ip(req));
  }

  @Patch('content/topics/:topicId/pin')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Pin or unpin a forum topic' })
  @ApiParam({ name: 'topicId', description: 'Forum topic UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['is_pinned'],
      properties: {
        is_pinned: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Topic pin status updated', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  pinTopic(@Req() req: any, @Param('topicId') topicId: string, @Body() body: { is_pinned: boolean }) {
    return this.moderation.pinTopic(req.user.userId, req.user.username, topicId, body.is_pinned, ip(req));
  }

  @Patch('content/topics/:topicId/lock')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'Lock or unlock a forum topic', description: 'Prevents new comments when locked.' })
  @ApiParam({ name: 'topicId', description: 'Forum topic UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['is_locked'],
      properties: {
        is_locked: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Topic lock status updated', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  lockTopic(@Req() req: any, @Param('topicId') topicId: string, @Body() body: { is_locked: boolean }) {
    return this.moderation.lockTopic(req.user.userId, req.user.username, topicId, body.is_locked, ip(req));
  }

  // ─── Forums ─────────────────────────────────────────────────────────────────

  @Get('forums')
  @UseGuards(ModeratorGuard)
  @ApiOperation({ summary: 'List forums', description: 'Paginated list of all forums including hidden and locked ones.' })
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
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a forum', description: 'Creates a new global or company-scoped forum. Requires admin role.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'scope'],
      properties: {
        name: { type: 'string', example: 'Mental Health Support' },
        description: { type: 'string', example: 'A safe space to discuss mental health topics.' },
        scope: { type: 'string', enum: ['global', 'company'], example: 'global' },
        company_id: { type: 'string', nullable: true, example: 'company-uuid', description: 'Required when scope = "company"' },
        icon: { type: 'string', example: '🧠' },
        tags: { type: 'array', items: { type: 'string' }, example: ['mental-health', 'wellness'] },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Forum created', schema: { example: { id: 'forum-uuid', name: 'Mental Health Support' } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  createForum(@Req() req: any, @Body() body: any) {
    return this.forums.createForum(req.user.userId, req.user.username, body, ip(req));
  }

  @Patch('forums/:forumId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a forum', description: 'Update name, description, lock status, or visibility. Requires admin role.' })
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
  @ApiResponse({ status: 200, description: 'Forum updated', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Forum not found' })
  updateForum(@Req() req: any, @Param('forumId') forumId: string, @Body() body: any) {
    return this.forums.updateForum(req.user.userId, req.user.username, forumId, body, ip(req));
  }

  @Delete('forums/:forumId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a forum', description: 'Soft-deletes the forum and records an audit log. Requires admin role.' })
  @ApiParam({ name: 'forumId', description: 'Forum UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: 'Forum no longer relevant — merged with another.' },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Forum deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Forum not found' })
  deleteForum(@Req() req: any, @Param('forumId') forumId: string, @Body() body: { reason: string }) {
    return this.forums.deleteForum(req.user.userId, req.user.username, forumId, body.reason, ip(req));
  }

  // ─── Nooks ──────────────────────────────────────────────────────────────────

  @Get('nooks')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List nooks', description: 'Paginated list of all nooks including hidden and expired ones. Requires admin role.' })
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
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  listNooks(@Query() query: any) {
    return this.nooks.listNooks(query);
  }

  @Post('nooks')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a nook', description: 'Creates a new nook and records an audit log. Requires admin role.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'HR Policy Review Group' },
        description: { type: 'string', example: 'Private group for reviewing the updated HR policy.' },
        expires_at: { type: 'string', format: 'date-time', example: '2026-06-01T00:00:00Z' },
        member_ids: { type: 'array', items: { type: 'string' }, example: ['uuid-1', 'uuid-2'] },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Nook created', schema: { example: { id: 'nook-uuid', name: 'HR Policy Review Group' } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  createNook(@Req() req: any, @Body() body: any) {
    return this.nooks.createNook(req.user.userId, req.user.username, body, ip(req));
  }

  @Patch('nooks/:nookId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a nook', description: 'Update nook name, description, expiry, or visibility. Requires admin role.' })
  @ApiParam({ name: 'nookId', description: 'Nook UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Updated Nook Name' },
        description: { type: 'string', example: 'Updated description.' },
        is_hidden: { type: 'boolean', example: false },
        expires_at: { type: 'string', format: 'date-time', example: '2026-07-01T00:00:00Z' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Nook updated', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Nook not found' })
  updateNook(@Req() req: any, @Param('nookId') nookId: string, @Body() body: any) {
    return this.nooks.updateNook(req.user.userId, req.user.username, nookId, body, ip(req));
  }

  @Delete('nooks/:nookId')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a nook', description: 'Soft-deletes the nook and records an audit log. Requires admin role.' })
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
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Nook not found' })
  deleteNook(@Req() req: any, @Param('nookId') nookId: string, @Body() body: { reason: string }) {
    return this.nooks.deleteNook(req.user.userId, req.user.username, req.user.role, nookId, body.reason, ip(req));
  }

  @Delete('nooks/:nookId/members/:userId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Remove a member from a nook', description: 'Removes the specified user from the nook and records an audit log.' })
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
  @ApiResponse({ status: 200, description: 'Member removed', schema: { example: { success: true } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Nook or member not found' })
  removeNookMember(
    @Req() req: any,
    @Param('nookId') nookId: string,
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.nooks.removeMember(req.user.userId, req.user.username, nookId, userId, body.reason ?? '', ip(req));
  }

  // ─── Broadcast Notifications ─────────────────────────────────────────────────

  @Get('notifications')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List broadcast notifications', description: 'Returns admin-created broadcast notification campaigns. Requires admin role.' })
  @ApiResponse({
    status: 200,
    description: 'Paginated broadcast notification list',
    schema: {
      example: {
        data: [
          {
            id: 'notif-uuid',
            title: 'Scheduled Maintenance',
            message: 'The platform will be down for maintenance on Saturday from 2–4 AM UTC.',
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
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  listNotifications(@Query() query: any) {
    return this.notifications.listNotifications(query);
  }

  @Post('notifications')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a broadcast notification', description: 'Drafts a notification for later sending or sends immediately if send_now = true.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'message'],
      properties: {
        title: { type: 'string', example: 'Scheduled Maintenance' },
        message: { type: 'string', example: 'The platform will be down Saturday 2–4 AM UTC.' },
        send_now: { type: 'boolean', default: false, description: 'Set true to deliver immediately to all users' },
        target_role: { type: 'string', enum: ['all', 'moderator', 'admin'], default: 'all', example: 'all' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Notification created', schema: { example: { id: 'notif-uuid', title: 'Scheduled Maintenance' } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  createNotification(@Req() req: any, @Body() body: any) {
    return this.notifications.createNotification(req.user.userId, req.user.username, body, ip(req));
  }

  @Post('notifications/:id/send')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Send a broadcast notification', description: 'Delivers a drafted notification to all target users immediately.' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification sent', schema: { example: { success: true, recipients: 1200 } } })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 409, description: 'Notification already sent' })
  sendNotification(@Req() req: any, @Param('id') id: string) {
    return this.notifications.sendNotification(req.user.userId, req.user.username, id, ip(req));
  }

  @Delete('notifications/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a broadcast notification', description: 'Deletes a draft notification. Cannot delete already-sent notifications.' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete a notification that has already been sent' })
  deleteNotification(@Req() req: any, @Param('id') id: string) {
    return this.notifications.deleteNotification(req.user.userId, req.user.username, id, ip(req));
  }

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  @Get('logs')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin audit logs', description: 'Paginated, filterable log of all admin actions. Requires admin role.' })
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
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  getLogs(@Query() query: AdminLogQueryDto) {
    return this.logs.getLogs(query);
  }
}
