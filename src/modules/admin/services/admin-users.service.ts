import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import {
  AdminUserQueryDto,
  AdminUserExportQueryDto,
} from '../dto/admin-user-query.dto';
import {
  buildMeta,
  computeAccountStatus,
  parsePagination,
} from '../admin.helpers';
import logger from '../../../common/utils/logger.util';
import PDFDocument from 'pdfkit';

// Define interfaces for type safety
interface ExportResult {
  success: boolean;
  data: Buffer;
  metadata: {
    format: string;
    count: number;
    generated_at: string;
  };
}

@Injectable()
export class AdminUsersService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async listUsers(query: AdminUserQueryDto) {
    try {
      const page = query.page || '1';
      const limit = query.limit || '20';
      const { pageSize, offset } = parsePagination(page, limit);

      const sortBy = query.sortBy ?? 'created_at';
      const ascending = query.sortOrder === 'asc';

      logger.debug('Building users query', {
        page,
        limit,
        sortBy,
        ascending,
        offset,
      });

      let q = this.admin
        .from('user_profiles')
        .select(
          'id, username, email, role, avatar, job_title, is_suspended, is_deactivated, is_deleted, has_completed_onboarding, created_at, last_active_at, total_posts, total_comments',
          { count: 'exact' },
        )
        .order(sortBy === 'reports_against' ? 'created_at' : sortBy, {
          ascending,
        })
        .range(offset, offset + pageSize - 1);

      if (query.search) {
        q = q.or(
          `username.ilike.%${query.search}%,email.ilike.%${query.search}%`,
        );
      }
      if (query.role) q = q.eq('role', query.role);

      if (query.status === 'suspended') q = q.eq('is_suspended', true);
      else if (query.status === 'deactivated')
        q = q.eq('is_deactivated', true).eq('is_deleted', false);
      else if (query.status === 'deleted') q = q.eq('is_deleted', true);
      else if (query.status === 'active') {
        q = q
          .eq('is_suspended', false)
          .eq('is_deactivated', false)
          .eq('is_deleted', false);
      } else {
        q = q.eq('is_deleted', false);
      }

      const { data, error, count } = await q;

      if (error) {
        logger.error('Error fetching users', { error: error.message });
        throw new BadRequestException(error.message);
      }

      logger.debug(`Found ${data?.length || 0} users, total count: ${count}`);

      const userIds = (data || []).map((u: any) => u.id);
      const reportsMap: Record<string, number> = {};

      if (userIds.length > 0) {
        const { data: reports, error: reportsError } = await this.admin
          .from('harassment_reports')
          .select('reported_user_id')
          .in('reported_user_id', userIds);

        if (reportsError) {
          logger.warn('Error fetching reports', {
            error: reportsError.message,
          });
        } else {
          for (const r of reports ?? []) {
            if (r.reported_user_id)
              reportsMap[r.reported_user_id] =
                (reportsMap[r.reported_user_id] ?? 0) + 1;
          }
        }
      }

      const users = (data ?? []).map((u: any) => ({
        ...u,
        account_status: computeAccountStatus(u),
        reports_against: reportsMap[u.id] ?? 0,
      }));

      return {
        success: true,
        data: users,
        meta: buildMeta(parseInt(page), pageSize, count ?? 0),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Error in listUsers', {
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  }

  async getUserDetail(userId: string) {
    const { data: profile, error } = await this.admin
      .from('user_profiles')
      .select(
        'id, username, email, role, avatar, job_title, company_type, location, is_suspended, suspension_reason, suspended_at, suspension_expires_at, suspended_by, is_deactivated, is_deleted, has_completed_onboarding, created_at, last_active_at, total_posts, total_comments, mentorship_sessions_completed',
      )
      .eq('id', userId)
      .single();

    if (error || !profile) throw new NotFoundException('User not found');

    const [reportsAgainstResult, sessionCountResult, suspensionLogsResult] =
      await Promise.all([
        this.admin
          .from('harassment_reports')
          .select('id, reference_number, incident_type, status, created_at')
          .eq('reported_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
        this.admin
          .from('mentorship_sessions')
          .select('id', { count: 'exact' })
          .or(`mentor_id.eq.${userId},mentee_id.eq.${userId}`),
        this.admin
          .from('admin_logs')
          .select('action, reason, metadata, created_at, admin_username')
          .eq('target_id', userId)
          .in('action', ['suspend_user', 'unsuspend_user'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

    const suspensionHistory = (suspensionLogsResult.data ?? []).map(
      (log: any) => ({
        action: log.action,
        reason: log.reason,
        performed_by: log.admin_username,
        at: log.created_at,
        metadata: log.metadata,
      }),
    );

    return {
      success: true,
      data: {
        user: {
          ...profile,
          account_status: computeAccountStatus(profile),
          reports_against: reportsAgainstResult.data?.length ?? 0,
          total_posts: profile.total_posts ?? 0,
          total_comments: profile.total_comments ?? 0,
          mentorship_sessions: sessionCountResult.count ?? 0,
        },
        reports_against: reportsAgainstResult.data ?? [],
        suspension_history: suspensionHistory,
      },
    };
  }

  async suspendUser(
    adminId: string,
    adminUsername: string,
    adminRole: string,
    userId: string,
    reason: string,
    expiresAt?: string,
    ip?: string,
  ) {
    this.assertNotSelf(adminId, userId);
    await this.assertRoleHierarchy(adminRole, userId);

    const { error } = await this.admin
      .from('user_profiles')
      .update({
        is_suspended: true,
        suspension_reason: reason,
        suspended_at: new Date().toISOString(),
        suspension_expires_at: expiresAt ?? null,
        suspended_by: adminId,
      })
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);

    await this.logAction(
      adminId,
      adminUsername,
      'suspend_user',
      'user',
      userId,
      reason,
      { expires_at: expiresAt },
      ip,
    );

    await this.admin.from('notifications').insert({
      id: randomUUID(),
      user_id: userId,
      actor_id: adminId,
      type: 'report_status_update',
      title: 'Account Suspended',
      message: `Your account has been suspended. Reason: ${reason}`,
      is_read: false,
      delivery_method: ['in_app'],
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        id: userId,
        account_status: 'suspended',
        suspension_reason: reason,
        suspension_expires_at: expiresAt ?? null,
      },
    };
  }

  async unsuspendUser(
    adminId: string,
    adminUsername: string,
    userId: string,
    reason: string,
    ip?: string,
  ) {
    this.assertNotSelf(adminId, userId);

    const { error } = await this.admin
      .from('user_profiles')
      .update({
        is_suspended: false,
        suspension_reason: null,
        suspended_at: null,
        suspension_expires_at: null,
        suspended_by: null,
      })
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);

    await this.logAction(
      adminId,
      adminUsername,
      'unsuspend_user',
      'user',
      userId,
      reason,
      {},
      ip,
    );

    await this.admin.from('notifications').insert({
      id: randomUUID(),
      user_id: userId,
      actor_id: adminId,
      type: 'report_status_update',
      title: 'Account Reinstated',
      message: 'Your account suspension has been lifted.',
      is_read: false,
      delivery_method: ['in_app'],
      created_at: new Date().toISOString(),
    });

    return { success: true, data: { id: userId, account_status: 'active' } };
  }

  async changeRole(
    adminId: string,
    adminUsername: string,
    adminRole: string,
    userId: string,
    newRole: string,
    ip?: string,
  ) {
    const validRoles = ['user', 'moderator', 'admin'];
    if (!validRoles.includes(newRole))
      throw new BadRequestException(
        `Invalid role: ${newRole}. super_admin must be set at the database level.`,
      );
    if (newRole === 'admin' && adminRole !== 'super_admin')
      throw new ForbiddenException(
        'Only super_admin can assign the admin role',
      );

    this.assertNotSelf(adminId, userId);
    const { data: target } = await this.admin
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();
    const oldRole = target?.role ?? 'user';

    const { error } = await this.admin
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (error) throw new BadRequestException(error.message);

    await this.logAction(
      adminId,
      adminUsername,
      'change_role',
      'user',
      userId,
      `Role changed to ${newRole}`,
      { old_role: oldRole, new_role: newRole },
      ip,
    );
    return { success: true, data: { id: userId, role: newRole } };
  }

  async deleteUser(
    adminId: string,
    adminUsername: string,
    adminRole: string,
    userId: string,
    reason: string,
    ip?: string,
  ) {
    if (adminRole !== 'super_admin')
      throw new ForbiddenException('Only super_admin can delete users');
    this.assertNotSelf(adminId, userId);

    const { error } = await this.admin
      .from('user_profiles')
      .update({
        is_deleted: true,
        deletion_reason: reason,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);
    await this.logAction(
      adminId,
      adminUsername,
      'delete_user',
      'user',
      userId,
      reason,
      {},
      ip,
    );
    return null;
  }

  async notifyUser(
    adminId: string,
    adminUsername: string,
    userId: string,
    title: string,
    message: string,
    type: string,
    ip?: string,
  ) {
    const { error } = await this.admin.from('notifications').insert({
      id: randomUUID(),
      user_id: userId,
      actor_id: adminId,
      type,
      title,
      message,
      is_read: false,
      delivery_method: ['in_app'],
      created_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
    await this.logAction(
      adminId,
      adminUsername,
      'notify_user',
      'user',
      userId,
      undefined,
      { title, type },
      ip,
    );
    return { success: true, data: null };
  }

  async getAdminProfile(adminId: string) {
    const { data, error } = await this.admin
      .from('user_profiles')
      .select(
        'id, username, email, first_name_encrypted, last_name_encrypted, avatar, role, created_at, updated_at',
      )
      .eq('id', adminId)
      .single();

    if (error || !data) throw new NotFoundException('Admin profile not found');

    return {
      success: true,
      data: {
        id: data.id,
        username: data.username,
        email: data.email,
        first_name: data.first_name_encrypted ?? null,
        last_name: data.last_name_encrypted ?? null,
        avatar: data.avatar ?? null,
        role: data.role,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
    };
  }

  async updateAdminProfile(
    adminId: string,
    body: { first_name?: string; last_name?: string; username?: string },
  ) {
    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (body.first_name !== undefined)
      update.first_name_encrypted = body.first_name;
    if (body.last_name !== undefined)
      update.last_name_encrypted = body.last_name;
    if (body.username !== undefined) {
      // Check username uniqueness
      const { data: existing } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('username', body.username)
        .neq('id', adminId)
        .maybeSingle();
      if (existing) throw new BadRequestException('Username is already taken');
      update.username = body.username;
    }

    const { data, error } = await this.admin
      .from('user_profiles')
      .update(update)
      .eq('id', adminId)
      .select(
        'id, username, first_name_encrypted, last_name_encrypted, email, avatar, role',
      )
      .single();

    if (error) throw new BadRequestException(error.message);

    return {
      success: true,
      data: {
        id: data.id,
        username: data.username,
        email: data.email,
        first_name: data.first_name_encrypted ?? null,
        last_name: data.last_name_encrypted ?? null,
        avatar: data.avatar ?? null,
        role: data.role,
      },
    };
  }

  // ============================================
  // EXPORT FUNCTIONALITY
  // ============================================

  async exportUsers(params: AdminUserExportQueryDto): Promise<ExportResult> {
    try {
      logger.info('Starting user export', {
        format: params.format,
        filters: {
          search: params.search,
          role: params.role,
          status: params.status,
        },
      });

      // Fetch ALL users for export (no pagination)
      const users = await this.getAllUsersForExport(params);

      logger.info(`Found ${users.length} users for export`);

      if (!users || users.length === 0) {
        throw new BadRequestException('No users found to export');
      }

      // Generate export based on format
      if (params.format === 'csv') {
        return this.generateCsvExport(users);
      } else {
        return await this.generatePdfExport(users);
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Error in exportUsers', {
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  }

  // Fetch ALL users without pagination for export
  private async getAllUsersForExport(params: AdminUserExportQueryDto) {
    try {
      const sortBy = params.sortBy ?? 'created_at';
      const ascending = params.sortOrder === 'asc';

      logger.debug('Building users export query', {
        sortBy,
        ascending,
        search: params.search,
        role: params.role,
        status: params.status,
      });

      // Build query WITHOUT range/pagination
      let q = this.admin
        .from('user_profiles')
        .select(
          'id, username, email, role, avatar, job_title, is_suspended, is_deactivated, is_deleted, has_completed_onboarding, created_at, last_active_at, total_posts, total_comments',
        )
        .order(sortBy === 'reports_against' ? 'created_at' : sortBy, {
          ascending,
        });

      // Apply filters
      if (params.search) {
        q = q.or(
          `username.ilike.%${params.search}%,email.ilike.%${params.search}%`,
        );
      }
      if (params.role) q = q.eq('role', params.role);

      if (params.status === 'suspended') q = q.eq('is_suspended', true);
      else if (params.status === 'deactivated')
        q = q.eq('is_deactivated', true).eq('is_deleted', false);
      else if (params.status === 'deleted') q = q.eq('is_deleted', true);
      else if (params.status === 'active') {
        q = q
          .eq('is_suspended', false)
          .eq('is_deactivated', false)
          .eq('is_deleted', false);
      } else {
        q = q.eq('is_deleted', false);
      }

      // Execute query - NO .range() means we get ALL results
      const { data, error } = await q;

      if (error) {
        logger.error('Error fetching users for export', {
          error: error.message,
        });
        throw new BadRequestException(error.message);
      }

      logger.debug(`Fetched ${data?.length || 0} users for export`);

      // Fetch reports count for all users in chunks
      const userIds = (data || []).map((u: any) => u.id);
      const reportsMap: Record<string, number> = {};

      if (userIds.length > 0) {
        // Fetch reports in chunks of 1000 to avoid Supabase query limits
        const chunkSize = 1000;
        for (let i = 0; i < userIds.length; i += chunkSize) {
          const chunk = userIds.slice(i, i + chunkSize);
          const { data: reports, error: reportsError } = await this.admin
            .from('harassment_reports')
            .select('reported_user_id')
            .in('reported_user_id', chunk);

          if (reportsError) {
            logger.warn('Error fetching reports', {
              error: reportsError.message,
            });
          } else {
            for (const r of reports ?? []) {
              if (r.reported_user_id)
                reportsMap[r.reported_user_id] =
                  (reportsMap[r.reported_user_id] ?? 0) + 1;
            }
          }
        }
      }

      const users = (data ?? []).map((u: any) => ({
        ...u,
        account_status: computeAccountStatus(u),
        reports_against: reportsMap[u.id] ?? 0,
      }));

      return users;
    } catch (error) {
      const err = error as Error;
      logger.error('Error in getAllUsersForExport', {
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  }

  private generateCsvExport(users: any[]): ExportResult {
    if (!users || users.length === 0) {
      throw new BadRequestException('No users to export');
    }

    const headers = [
      'ID',
      'Username',
      'Email',
      'Role',
      'Status',
      'Job Title',
      'Created At',
      'Last Active',
      'Total Posts',
      'Total Comments',
      'Reports Against',
    ];

    const rows = users.map((user) => [
      user.id || '',
      user.username || '',
      user.email || '',
      user.role || 'user',
      user.account_status || 'unknown',
      user.job_title || '',
      user.created_at ? new Date(user.created_at).toLocaleString() : '',
      user.last_active_at ? new Date(user.last_active_at).toLocaleString() : '',
      user.total_posts || 0,
      user.total_comments || 0,
      user.reports_against || 0,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    logger.info(`Generated CSV with ${users.length} users`);

    return {
      success: true,
      data: Buffer.from(csvContent, 'utf-8'),
      metadata: {
        format: 'csv',
        count: users.length,
        generated_at: new Date().toISOString(),
      },
    };
  }

  private async generatePdfExport(users: any[]): Promise<ExportResult> {
    if (!users || users.length === 0) {
      throw new BadRequestException('No users to export');
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 40,
          info: {
            Title: 'AffinityEcho Users Report',
            Author: 'AffinityEcho Admin Portal',
            Subject: 'User Data Export',
            Keywords: 'users, export, admin, affinityecho',
            CreationDate: new Date(),
          },
        });

        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve({
            success: true,
            data: pdfData,
            metadata: {
              format: 'pdf',
              count: users.length,
              generated_at: new Date().toISOString(),
            },
          });
        });
        doc.on('error', (error) => {
          const err = error as Error;
          reject(
            new BadRequestException(`Failed to generate PDF: ${err.message}`),
          );
        });

        this.addPdfContent(doc, users);
        doc.end();
      } catch (error) {
        const err = error as Error;
        reject(
          new BadRequestException(`Failed to generate PDF: ${err.message}`),
        );
      }
    });
  }

  private addPdfContent(doc: PDFKit.PDFDocument, users: any[]) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;

    // Helper function for formatting dates
    const formatDate = (dateString: string) => {
      if (!dateString) return 'Never';
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    };

    // Add subtle background
    doc.rect(0, 0, pageWidth, pageHeight).fill('#f8fafc');

    // ============================================
    // HEADER SECTION
    // ============================================
    doc.fillColor('#1e293b');

    // Company/App Name
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('AffinityEcho', margin, margin);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#64748b')
      .text('Admin Portal', margin, margin + 26);

    // Report Title (centered)
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#334155')
      .text('Users Report', 0, margin + 5, {
        align: 'center',
        width: pageWidth,
      });

    // Metadata (right aligned)
    const metadataX = pageWidth - margin - 150;
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#64748b')
      .text(
        `Generated: ${new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}`,
        metadataX,
        margin,
        { width: 150, align: 'right' },
      );

    doc.text(`Total Users: ${users.length}`, metadataX, margin + 12, {
      width: 150,
      align: 'right',
    });

    // ============================================
    // SUMMARY STATISTICS BOX
    // ============================================
    const summaryY = margin + 60;
    const summaryHeight = 50;
    const summaryWidth = pageWidth - 2 * margin;

    // Calculate statistics
    const stats = {
      total: users.length,
      active: users.filter((u) => u.account_status === 'active').length,
      suspended: users.filter((u) => u.account_status === 'suspended').length,
      deactivated: users.filter((u) => u.account_status === 'deactivated')
        .length,
      deleted: users.filter((u) => u.account_status === 'deleted').length,
      admins: users.filter(
        (u) => u.role === 'admin' || u.role === 'super_admin',
      ).length,
      moderators: users.filter((u) => u.role === 'moderator').length,
      regular: users.filter((u) => u.role === 'user').length,
    };

    // Summary box background
    doc
      .roundedRect(margin, summaryY, summaryWidth, summaryHeight, 8)
      .fill('#ffffff')
      .stroke('#e2e8f0');

    // Summary title
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#334155')
      .text('Summary Statistics', margin + 15, summaryY + 12);

    // Summary stats grid
    const statY = summaryY + 28;
    const statSpacing = summaryWidth / 7;

    // Define stats with colors
    const statItems = [
      { label: 'Active', value: stats.active, color: '#22c55e' },
      { label: 'Suspended', value: stats.suspended, color: '#ef4444' },
      { label: 'Deactivated', value: stats.deactivated, color: '#fb923c' },
      { label: 'Deleted', value: stats.deleted, color: '#6b7280' },
      { label: 'Regular', value: stats.regular, color: '#3b82f6' },
      { label: 'Moderators', value: stats.moderators, color: '#a855f7' },
      { label: 'Admins', value: stats.admins, color: '#ec4899' },
    ];

    statItems.forEach((stat, index) => {
      const x = margin + 15 + index * statSpacing;

      // Label
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(stat.label, x, statY, { width: statSpacing - 10 });

      // Value with color
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor(stat.color)
        .text(stat.value.toString(), x, statY + 10, {
          width: statSpacing - 10,
        });
    });

    // ============================================
    // TABLE SECTION
    // ============================================
    const tableY = summaryY + summaryHeight + 20;
    const tableWidth = pageWidth - 2 * margin;

    // Define column widths
    const columnWidths = {
      no: 30,
      username: 100,
      email: 130,
      role: 70,
      status: 70,
      posts: 45,
      comments: 50,
      reports: 45,
      created: 85,
    };

    let xPos = margin;

    // Table header
    doc.rect(margin, tableY, tableWidth, 25).fill('#9333ea');

    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');

    // Header labels
    const headers = [
      { label: '#', width: columnWidths.no },
      { label: 'Username', width: columnWidths.username },
      { label: 'Email', width: columnWidths.email },
      { label: 'Role', width: columnWidths.role },
      { label: 'Status', width: columnWidths.status },
      { label: 'Posts', width: columnWidths.posts },
      { label: 'Comments', width: columnWidths.comments },
      { label: 'Reports', width: columnWidths.reports },
      { label: 'Created', width: columnWidths.created },
    ];

    xPos = margin;
    headers.forEach((header) => {
      doc.text(header.label, xPos + 5, tableY + 8, {
        width: header.width - 10,
        align: 'left',
      });
      xPos += header.width;
    });

    // Table rows
    let rowY = tableY + 25;
    const rowHeight = 18;
    const maxRowsPerPage = Math.floor((pageHeight - rowY - 60) / rowHeight);

    users.forEach((user, index) => {
      // Add new page if needed
      if (index > 0 && index % maxRowsPerPage === 0) {
        // Add footer before new page
        this.addFooter(doc, pageWidth, pageHeight, margin);
        doc.addPage();
        rowY = margin;

        // Re-draw header on new page
        doc.rect(margin, rowY, tableWidth, 25).fill('#9333ea');
        doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');

        xPos = margin;
        headers.forEach((header) => {
          doc.text(header.label, xPos + 5, rowY + 8, {
            width: header.width - 10,
            align: 'left',
          });
          xPos += header.width;
        });

        rowY += 25;
      }

      // Alternating row background
      if (index % 2 === 0) {
        doc.rect(margin, rowY, tableWidth, rowHeight).fill('#f8fafc');
      } else {
        doc.rect(margin, rowY, tableWidth, rowHeight).fill('#ffffff');
      }

      doc.fontSize(7).font('Helvetica');

      // Row data
      xPos = margin;

      // # (Number)
      doc
        .fillColor('#334155')
        .text((index + 1).toString(), xPos + 5, rowY + 5, {
          width: columnWidths.no - 10,
          ellipsis: true,
        });
      xPos += columnWidths.no;

      // Username (Bold)
      doc
        .font('Helvetica-Bold')
        .fillColor('#1e293b')
        .text(user.username || 'N/A', xPos + 5, rowY + 5, {
          width: columnWidths.username - 10,
          ellipsis: true,
        });
      xPos += columnWidths.username;

      // Email
      doc
        .font('Helvetica')
        .fillColor('#64748b')
        .text(user.email || 'N/A', xPos + 5, rowY + 5, {
          width: columnWidths.email - 10,
          ellipsis: true,
        });
      xPos += columnWidths.email;

      // Role (with color)
      const roleColorMap: Record<string, string> = {
        super_admin: '#ec4899',
        admin: '#a855f7',
        moderator: '#3b82f6',
        user: '#6b7280',
      };
      doc
        .font('Helvetica-Bold')
        .fillColor(roleColorMap[user.role] || '#6b7280')
        .text((user.role || 'user').replace('_', ' '), xPos + 5, rowY + 5, {
          width: columnWidths.role - 10,
        });
      xPos += columnWidths.role;

      // Status (with color)
      const statusColorMap: Record<string, string> = {
        active: '#22c55e',
        suspended: '#ef4444',
        deactivated: '#fb923c',
        deleted: '#6b7280',
      };
      doc
        .font('Helvetica-Bold')
        .fillColor(statusColorMap[user.account_status] || '#6b7280')
        .text(user.account_status || 'unknown', xPos + 5, rowY + 5, {
          width: columnWidths.status - 10,
        });
      xPos += columnWidths.status;

      // Posts
      doc
        .font('Helvetica')
        .fillColor('#334155')
        .text((user.total_posts || 0).toString(), xPos + 5, rowY + 5, {
          width: columnWidths.posts - 10,
          align: 'center',
        });
      xPos += columnWidths.posts;

      // Comments
      doc.text((user.total_comments || 0).toString(), xPos + 5, rowY + 5, {
        width: columnWidths.comments - 10,
        align: 'center',
      });
      xPos += columnWidths.comments;

      // Reports (highlight if > 0)
      const reportsCount = user.reports_against || 0;
      if (reportsCount > 0) {
        doc.fillColor('#ef4444').font('Helvetica-Bold');
      } else {
        doc.fillColor('#334155').font('Helvetica');
      }
      doc.text(reportsCount.toString(), xPos + 5, rowY + 5, {
        width: columnWidths.reports - 10,
        align: 'center',
      });
      xPos += columnWidths.reports;

      // Created date
      doc
        .font('Helvetica')
        .fillColor('#64748b')
        .text(formatDate(user.created_at), xPos + 5, rowY + 5, {
          width: columnWidths.created - 10,
          ellipsis: true,
        });

      rowY += rowHeight;
    });

    // Add footer to last page
    this.addFooter(doc, pageWidth, pageHeight, margin);
  }

  private addFooter(
    doc: PDFKit.PDFDocument,
    pageWidth: number,
    pageHeight: number,
    margin: number,
  ) {
    const footerY = pageHeight - margin - 15;

    // Footer divider line
    doc
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .moveTo(margin, footerY)
      .lineTo(pageWidth - margin, footerY)
      .stroke();

    // Footer text
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8');

    // Left: Confidential
    doc.text('Confidential - Admin Use Only', margin, footerY + 5, {
      width: (pageWidth - 2 * margin) / 3,
      align: 'left',
    });

    // Center: Company name
    doc.text(
      'AffinityEcho Admin Portal',
      (pageWidth - 2 * margin) / 3 + margin,
      footerY + 5,
      { width: (pageWidth - 2 * margin) / 3, align: 'center' },
    );

    // Right: Page number
    const pageNum = (doc as any).bufferedPageRange().start + 1;
    doc.text(
      `Page ${pageNum}`,
      (2 * (pageWidth - 2 * margin)) / 3 + margin,
      footerY + 5,
      { width: (pageWidth - 2 * margin) / 3, align: 'right' },
    );
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private assertNotSelf(adminId: string, targetId: string) {
    if (adminId === targetId)
      throw new BadRequestException('Cannot perform this action on yourself');
  }

  private async assertRoleHierarchy(adminRole: string, targetUserId: string) {
    const { data: target } = await this.admin
      .from('user_profiles')
      .select('role')
      .eq('id', targetUserId)
      .single();
    if (!target) return;
    if (target.role === 'super_admin')
      throw new ForbiddenException('Cannot act on a super_admin account');
    if (target.role === 'admin' && adminRole !== 'super_admin')
      throw new ForbiddenException(
        'Only super_admin can act on admin accounts',
      );
  }

  async logAction(
    adminId: string,
    adminUsername: string,
    action: string,
    targetType: string,
    targetId: string,
    reason?: string,
    metadata?: Record<string, any>,
    ip?: string,
  ) {
    try {
      await this.admin.from('admin_logs').insert({
        id: randomUUID(),
        admin_id: adminId,
        admin_username: adminUsername,
        action,
        target_type: targetType,
        target_id: targetId,
        reason: reason ?? null,
        metadata: metadata ?? {},
        ip_address: ip ?? null,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.warn('Failed to write admin log', { action, err: err.message });
    }
  }
}
