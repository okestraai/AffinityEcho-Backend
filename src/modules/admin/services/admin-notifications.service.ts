import { Injectable, BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';
import PDFDocument from 'pdfkit';

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

  async exportNotifications(
    query: { status?: string; audience?: string; type?: string },
    format: 'csv' | 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    let q = this.admin
      .from('admin_notifications')
      .select('id, title, message, type, audience, status, recipients_count, sent_at, scheduled_at, created_at')
      .order('created_at', { ascending: false });

    if (query.status) q = q.eq('status', query.status);
    if (query.audience) q = q.eq('audience', query.audience);
    if (query.type) q = q.eq('type', query.type);

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const notifs = data ?? [];

    const date = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const headers = ['ID', 'Title', 'Type', 'Audience', 'Status', 'Recipients', 'Sent At', 'Scheduled At', 'Created At'];
      const rows = notifs.map((n: any) => [
        n.id, n.title, n.type || '-', n.audience || 'all', n.status,
        n.recipients_count ?? 0, n.sent_at || '', n.scheduled_at || '', n.created_at,
      ]);
      const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((c) => `"${c}"`).join(','))].join('\n');
      return {
        buffer: Buffer.from('\uFEFF' + csv, 'utf-8'),
        filename: `notifications-${date}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, info: { Title: 'Notifications Export', Author: 'AffinityEcho Admin', CreationDate: new Date() } });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pw = doc.page.width;
      const m = 40;

      doc.rect(0, 0, pw, 60).fill('#0369a1');
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff').text('Notifications Export', m, 18);
      doc.fontSize(9).font('Helvetica').fillColor('#bae6fd')
        .text(`Generated: ${new Date().toLocaleString()}  |  Total: ${notifs.length}`, m, 40);

      let y = 80;
      const cols = [
        { label: 'Title', w: 200 },
        { label: 'Type', w: 80 },
        { label: 'Audience', w: 80 },
        { label: 'Status', w: 70 },
        { label: 'Recipients', w: 80 },
        { label: 'Sent At', w: pw - m * 2 - 510 },
      ];

      const drawHeader = () => {
        doc.rect(m, y, pw - 2 * m, 18).fill('#075985');
        let x = m;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
        cols.forEach((col) => { doc.text(col.label, x + 4, y + 5, { width: col.w - 8 }); x += col.w; });
        y += 18;
      };
      drawHeader();

      const statusColors: Record<string, string> = { sent: '#065f46', scheduled: '#1e40af', draft: '#374151' };

      notifs.forEach((n: any, i: number) => {
        if (y + 20 > doc.page.height - 40) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 }); y = 40; drawHeader(); }
        doc.rect(m, y, pw - 2 * m, 20).fill(i % 2 === 0 ? '#ffffff' : '#f0f9ff');
        let x = m;
        doc.fontSize(7).fillColor('#1f2937');
        doc.font('Helvetica-Bold').text(n.title || '-', x + 4, y + 6, { width: cols[0].w - 8 }); x += cols[0].w;
        doc.font('Helvetica').text(n.type || '-', x + 4, y + 6, { width: cols[1].w - 8 }); x += cols[1].w;
        doc.text(n.audience || 'all', x + 4, y + 6, { width: cols[2].w - 8 }); x += cols[2].w;
        doc.fillColor(statusColors[n.status] || '#374151').font('Helvetica-Bold').text((n.status || '-').toUpperCase(), x + 4, y + 6, { width: cols[3].w - 8 }); x += cols[3].w;
        doc.fillColor('#1f2937').font('Helvetica').text(String(n.recipients_count ?? 0), x + 4, y + 6, { width: cols[4].w - 8 }); x += cols[4].w;
        doc.text(n.sent_at ? new Date(n.sent_at).toLocaleDateString() : '-', x + 4, y + 6, { width: cols[5].w - 8 });
        y += 20;
      });

      doc.end();
    });

    return { buffer, filename: `notifications-${date}.pdf`, contentType: 'application/pdf' };
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
