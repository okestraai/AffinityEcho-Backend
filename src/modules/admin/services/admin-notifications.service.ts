import { Injectable, BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';

@Injectable()
export class AdminNotificationsService {
  private admin;

  constructor(private config: ConfigService, private adminUsers: AdminUsersService) {
    this.admin = supabaseAdmin(config);
  }

  async listNotifications(query: { page?: string; limit?: string; status?: string; audience?: string; type?: string }) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);

    let q = this.admin
      .from('admin_notifications')
      .select('*, creator:user_profiles!created_by(id, username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (query.status) q = q.eq('status', query.status);
    if (query.audience) q = q.eq('audience', query.audience);
    if (query.type) q = q.eq('type', query.type);

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    // Summary
    const { data: allRows } = await this.admin.from('admin_notifications').select('status, recipients_count');
    const summary = { sent: 0, scheduled: 0, draft: 0, total_reach: 0 };
    for (const r of allRows ?? []) {
      if (r.status === 'sent') { summary.sent++; summary.total_reach += r.recipients_count ?? 0; }
      else if (r.status === 'scheduled') summary.scheduled++;
      else if (r.status === 'draft') summary.draft++;
    }

    return {
      success: true,
      data: { summary, items: data ?? [] },
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  async createNotification(
    adminId: string, adminUsername: string,
    body: {
      title: string; message: string; type: string; audience: string;
      action?: string; action_url?: string; scheduled_at?: string;
    },
    ip?: string,
  ) {
    const { title, message, type, audience, action = 'draft', action_url, scheduled_at } = body;

    if (!title || !message) throw new BadRequestException('title and message are required');
    if (action === 'schedule' && !scheduled_at) throw new BadRequestException('scheduled_at required when action is schedule');

    let status: string;
    let sentAt: string | null = null;
    let recipientsCount = 0;

    if (action === 'send') {
      status = 'sent';
      sentAt = new Date().toISOString();
    } else if (action === 'schedule') {
      status = 'scheduled';
    } else {
      status = 'draft';
    }

    // Create the admin_notification record
    const { data: notif, error } = await this.admin.from('admin_notifications').insert({
      id: randomUUID(), title, message,
      type: type ?? 'system',
      audience: audience ?? 'all',
      status, action_url: action_url ?? null,
      scheduled_at: scheduled_at ?? null,
      sent_at: sentAt,
      recipients_count: 0,
      created_by: adminId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw new BadRequestException(error.message);

    // Fan-out immediately if action = 'send'
    if (action === 'send') {
      recipientsCount = await this.fanOut(adminId, notif.id, title, message, audience, action_url);
      await this.admin.from('admin_notifications').update({ recipients_count: recipientsCount }).eq('id', notif.id);
    }

    await this.adminUsers.logAction(adminId, adminUsername, 'broadcast_notification', 'notification', notif.id, undefined, { audience, action, recipients_count: recipientsCount }, ip);

    return { success: true, data: { ...notif, recipients_count: recipientsCount } };
  }

  async sendNotification(adminId: string, adminUsername: string, notifId: string, ip?: string) {
    const { data: notif, error } = await this.admin
      .from('admin_notifications')
      .select('*')
      .eq('id', notifId)
      .single();

    if (error || !notif) throw new NotFoundException('Notification not found');
    if (notif.status === 'sent') throw new UnprocessableEntityException('Notification has already been sent');

    const recipientsCount = await this.fanOut(adminId, notifId, notif.title, notif.message, notif.audience, notif.action_url);

    await this.admin.from('admin_notifications').update({
      status: 'sent', sent_at: new Date().toISOString(),
      recipients_count: recipientsCount, updated_at: new Date().toISOString(),
    }).eq('id', notifId);

    await this.adminUsers.logAction(adminId, adminUsername, 'broadcast_notification', 'notification', notifId, undefined, { recipients_count: recipientsCount }, ip);
    return { success: true, data: { id: notifId, status: 'sent', recipients_count: recipientsCount } };
  }

  async deleteNotification(adminId: string, adminUsername: string, notifId: string, ip?: string) {
    const { data: notif } = await this.admin.from('admin_notifications').select('status').eq('id', notifId).single();
    if (!notif) throw new NotFoundException('Notification not found');
    if (notif.status === 'sent') throw new UnprocessableEntityException('Cannot delete a sent notification');

    const { error } = await this.admin.from('admin_notifications').delete().eq('id', notifId);
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, 'delete_notification', 'notification', notifId, undefined, {}, ip);
    return null;
  }

  async notifyUser(adminId: string, adminUsername: string, userId: string, title: string, message: string, type: string, ip?: string) {
    const { error } = await this.admin.from('notifications').insert({
      id: randomUUID(), user_id: userId, actor_id: adminId,
      type: 'report_status_update', title, message,
      is_read: false, delivery_method: ['in_app'], created_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, 'notify_user', 'user', userId, undefined, { title, type }, ip);
    return { success: true, data: null };
  }

  private async fanOut(adminId: string, notifId: string, title: string, message: string, audience: string, actionUrl?: string | null): Promise<number> {
    let q = this.admin.from('user_profiles').select('id')
      .eq('is_deleted', false).eq('is_suspended', false).eq('is_deactivated', false);

    if (audience === 'admins') q = q.in('role', ['admin', 'super_admin']);
    else if (audience === 'moderators') q = q.eq('role', 'moderator');
    else if (audience === 'users') q = q.eq('role', 'user');

    const { data: users } = await q;
    const now = new Date().toISOString();
    const rows = (users ?? []).map((u: any) => ({
      id: randomUUID(), user_id: u.id, actor_id: adminId,
      type: 'report_status_update', title, message,
      action_url: actionUrl ?? null, is_read: false,
      delivery_method: ['in_app'], created_at: now,
    }));

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await this.admin.from('notifications').insert(rows.slice(i, i + BATCH));
    }
    return rows.length;
  }
}
