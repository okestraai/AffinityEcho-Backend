import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminUserQueryDto } from '../dto/admin-user-query.dto';
import { buildMeta, computeAccountStatus, parsePagination } from '../admin.helpers';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class AdminUsersService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async listUsers(query: AdminUserQueryDto) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);
    const sortBy = query.sortBy ?? 'created_at';
    const ascending = query.sortOrder === 'asc';

    let q = this.admin
      .from('user_profiles')
      .select(
        'id, username, email, role, avatar, job_title, is_suspended, is_deactivated, is_deleted, has_completed_onboarding, created_at, last_active_at, total_posts, total_comments',
        { count: 'exact' },
      )
      .order(sortBy === 'reports_against' ? 'created_at' : sortBy, { ascending })
      .range(offset, offset + pageSize - 1);

    if (query.search) q = q.ilike('username', `%${query.search}%`);
    if (query.role) q = q.eq('role', query.role);

    if (query.status === 'suspended') q = q.eq('is_suspended', true);
    else if (query.status === 'deactivated') q = q.eq('is_deactivated', true).eq('is_deleted', false);
    else if (query.status === 'deleted') q = q.eq('is_deleted', true);
    else if (query.status === 'active') {
      q = q.eq('is_suspended', false).eq('is_deactivated', false).eq('is_deleted', false);
    } else {
      q = q.eq('is_deleted', false);
    }

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    const userIds = (data || []).map((u: any) => u.id);
    const reportsMap: Record<string, number> = {};
    if (userIds.length > 0) {
      const { data: reports } = await this.admin
        .from('harassment_reports')
        .select('reported_user_id')
        .in('reported_user_id', userIds);
      for (const r of reports ?? []) {
        if (r.reported_user_id)
          reportsMap[r.reported_user_id] = (reportsMap[r.reported_user_id] ?? 0) + 1;
      }
    }

    const users = (data ?? []).map((u: any) => ({
      ...u,
      account_status: computeAccountStatus(u),
      reports_against: reportsMap[u.id] ?? 0,
    }));

    return { success: true, data: users, meta: buildMeta(page, pageSize, count ?? 0) };
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

    const [reportsAgainstResult, sessionCountResult, suspensionLogsResult] = await Promise.all([
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

    const suspensionHistory = (suspensionLogsResult.data ?? []).map((log: any) => ({
      action: log.action,
      reason: log.reason,
      performed_by: log.admin_username,
      at: log.created_at,
      metadata: log.metadata,
    }));

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
    adminId: string, adminUsername: string, adminRole: string,
    userId: string, reason: string, expiresAt?: string, ip?: string,
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

    await this.logAction(adminId, adminUsername, 'suspend_user', 'user', userId, reason, { expires_at: expiresAt }, ip);

    await this.admin.from('notifications').insert({
      id: randomUUID(), user_id: userId, actor_id: adminId,
      type: 'report_status_update', title: 'Account Suspended',
      message: `Your account has been suspended. Reason: ${reason}`,
      is_read: false, delivery_method: ['in_app'], created_at: new Date().toISOString(),
    });

    return { success: true, data: { id: userId, account_status: 'suspended', suspension_reason: reason, suspension_expires_at: expiresAt ?? null } };
  }

  async unsuspendUser(adminId: string, adminUsername: string, userId: string, reason: string, ip?: string) {
    this.assertNotSelf(adminId, userId);

    const { error } = await this.admin
      .from('user_profiles')
      .update({ is_suspended: false, suspension_reason: null, suspended_at: null, suspension_expires_at: null, suspended_by: null })
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);

    await this.logAction(adminId, adminUsername, 'unsuspend_user', 'user', userId, reason, {}, ip);

    await this.admin.from('notifications').insert({
      id: randomUUID(), user_id: userId, actor_id: adminId,
      type: 'report_status_update', title: 'Account Reinstated',
      message: 'Your account suspension has been lifted.',
      is_read: false, delivery_method: ['in_app'], created_at: new Date().toISOString(),
    });

    return { success: true, data: { id: userId, account_status: 'active' } };
  }

  async changeRole(
    adminId: string, adminUsername: string, adminRole: string,
    userId: string, newRole: string, ip?: string,
  ) {
    const validRoles = ['user', 'moderator', 'admin'];
    if (!validRoles.includes(newRole))
      throw new BadRequestException(`Invalid role: ${newRole}. super_admin must be set at the database level.`);
    if (newRole === 'admin' && adminRole !== 'super_admin')
      throw new ForbiddenException('Only super_admin can assign the admin role');

    this.assertNotSelf(adminId, userId);
    const { data: target } = await this.admin.from('user_profiles').select('role').eq('id', userId).single();
    const oldRole = target?.role ?? 'user';

    const { error } = await this.admin.from('user_profiles').update({ role: newRole }).eq('id', userId);
    if (error) throw new BadRequestException(error.message);

    await this.logAction(adminId, adminUsername, 'change_role', 'user', userId, `Role changed to ${newRole}`, { old_role: oldRole, new_role: newRole }, ip);
    return { success: true, data: { id: userId, role: newRole } };
  }

  async deleteUser(adminId: string, adminUsername: string, adminRole: string, userId: string, reason: string, ip?: string) {
    if (adminRole !== 'super_admin') throw new ForbiddenException('Only super_admin can delete users');
    this.assertNotSelf(adminId, userId);

    const { error } = await this.admin.from('user_profiles').update({
      is_deleted: true, deletion_reason: reason, deleted_at: new Date().toISOString(),
    }).eq('id', userId);

    if (error) throw new BadRequestException(error.message);
    await this.logAction(adminId, adminUsername, 'delete_user', 'user', userId, reason, {}, ip);
    return null;
  }

  async notifyUser(adminId: string, adminUsername: string, userId: string, title: string, message: string, type: string, ip?: string) {
    const { error } = await this.admin.from('notifications').insert({
      id: randomUUID(), user_id: userId, actor_id: adminId,
      type: 'report_status_update', title, message,
      is_read: false, delivery_method: ['in_app'], created_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
    await this.logAction(adminId, adminUsername, 'notify_user', 'user', userId, undefined, { title, type }, ip);
    return { success: true, data: null };
  }

  private assertNotSelf(adminId: string, targetId: string) {
    if (adminId === targetId) throw new BadRequestException('Cannot perform this action on yourself');
  }

  private async assertRoleHierarchy(adminRole: string, targetUserId: string) {
    const { data: target } = await this.admin.from('user_profiles').select('role').eq('id', targetUserId).single();
    if (!target) return;
    if (target.role === 'super_admin') throw new ForbiddenException('Cannot act on a super_admin account');
    if (target.role === 'admin' && adminRole !== 'super_admin')
      throw new ForbiddenException('Only super_admin can act on admin accounts');
  }

  async logAction(
    adminId: string, adminUsername: string, action: string,
    targetType: string, targetId: string,
    reason?: string, metadata?: Record<string, any>, ip?: string,
  ) {
    try {
      await this.admin.from('admin_logs').insert({
        id: randomUUID(), admin_id: adminId, admin_username: adminUsername,
        action, target_type: targetType, target_id: targetId,
        reason: reason ?? null, metadata: metadata ?? {}, ip_address: ip ?? null,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.warn('Failed to write admin log', { action, err: err.message });
    }
  }
}
