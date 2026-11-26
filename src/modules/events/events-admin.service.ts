import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../database/supabase.client';
import logger from '../../common/utils/logger.util';
import { EventNoticesService } from './event-notices.service';

@Injectable()
export class EventsAdminService {
  private admin;

  constructor(
    config: ConfigService,
    private readonly notices: EventNoticesService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async list(query: {
    status?: string;
    reported?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    let q = this.admin
      .from('events')
      .select(
        'id, slug, title, mode, starts_at, ends_at, time_zone, venue_city, organiser_name, status, host_id, removed_reason, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (query.status) q = q.eq('status', query.status);
    if (query.reported === 'true') {
      const { data: reports } = await this.admin
        .from('event_reports')
        .select('event_id')
        .eq('status', 'open');
      q = q.in('id', [...new Set((reports ?? []).map((r: any) => r.event_id))]);
    }
    const { data, count } = await q;
    const ids = (data ?? []).map((e: any) => e.id);
    const { data: reports } = ids.length
      ? await this.admin
          .from('event_reports')
          .select('event_id, reason, created_at')
          .in('event_id', ids)
          .eq('status', 'open')
      : { data: [] };
    return {
      success: true,
      data: (data ?? []).map((e: any) => ({
        ...e,
        reports: (reports ?? []).filter((r: any) => r.event_id === e.id),
      })),
      meta: { page, limit, total: count ?? 0 },
    };
  }

  async remove(admin: AdminActor, eventId: string, reason: string) {
    const now = new Date().toISOString();
    const { data } = await this.admin
      .from('events')
      .update({
        status: 'removed',
        removed_reason: reason,
        removed_by: admin.id,
        removed_at: now,
        updated_at: now,
      })
      .eq('id', eventId)
      .neq('status', 'removed')
      .select('id, status');
    if (!data?.length)
      throw new NotFoundException('Event not found or already removed');
    await this.admin
      .from('event_reports')
      .update({ status: 'closed' })
      .eq('event_id', eventId);
    // Guests learn the event is off, as with a cancellation.
    await this.notices.queueCancel(eventId);
    await this.log(admin, 'remove_event', 'event', eventId, reason);
    return { success: true };
  }

  async stopHost(admin: AdminActor, userId: string, reason: string) {
    const { data } = await this.admin
      .from('user_profiles')
      .update({
        event_hosting_stopped_at: new Date().toISOString(),
        event_hosting_stopped_reason: reason,
      })
      .eq('id', userId)
      .is('event_hosting_stopped_at', null)
      .select('id');
    if (!data?.length)
      throw new ConflictException('User not found or already stopped');
    await this.log(admin, 'stop_event_host', 'user', userId, reason);
    return { success: true };
  }

  async allowHost(admin: AdminActor, userId: string) {
    const { data } = await this.admin
      .from('user_profiles')
      .update({
        event_hosting_stopped_at: null,
        event_hosting_stopped_reason: null,
      })
      .eq('id', userId)
      .select('id');
    if (!data?.length) throw new NotFoundException('User not found');
    await this.log(admin, 'allow_event_host', 'user', userId);
    return { success: true };
  }

  async dismissReports(admin: AdminActor, eventId: string) {
    await this.admin
      .from('event_reports')
      .update({ status: 'dismissed' })
      .eq('event_id', eventId)
      .eq('status', 'open');
    await this.log(admin, 'dismiss_event_reports', 'event', eventId);
    return { success: true };
  }

  private async log(
    admin: AdminActor,
    action: string,
    targetType: string,
    targetId: string,
    reason?: string,
  ) {
    try {
      await this.admin.from('admin_logs').insert({
        id: randomUUID(),
        admin_id: admin.id,
        admin_username: admin.username,
        action,
        target_type: targetType,
        target_id: targetId,
        reason: reason ?? null,
        metadata: {},
        ip_address: admin.ip ?? null,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn('Failed to write admin log', { action, error });
    }
  }
}

export interface AdminActor {
  id: string;
  username: string;
  ip?: string;
}
