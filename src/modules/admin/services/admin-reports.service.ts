import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminReportQueryDto } from '../dto/admin-report-query.dto';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';

@Injectable()
export class AdminReportsService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async listReports(adminId: string, query: AdminReportQueryDto) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);
    const sortBy = query.sortBy ?? 'created_at';
    const ascending = query.sortOrder === 'asc';

    let q = this.admin
      .from('harassment_reports')
      .select(
        `id, reference_number, incident_type, status, immediate_risk, description,
         created_at, updated_at, assigned_to, reported_user_id,
         reporter:user_profiles!reporter_id(id, username, avatar)`,
        { count: 'exact' },
      )
      .order(sortBy, { ascending })
      .range(offset, offset + pageSize - 1);

    if (query.status) q = q.eq('status', query.status);
    if (query.type) q = q.eq('incident_type', query.type);
    if (query.priority === 'high') q = q.eq('immediate_risk', true);
    if (query.assignedTo === 'me') q = q.eq('assigned_to', adminId);
    else if (query.assignedTo === 'unassigned') q = q.is('assigned_to', null);
    else if (query.assignedTo) q = q.eq('assigned_to', query.assignedTo);

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    // Summary counts across ALL reports (ignoring current filters)
    const { data: summaryData } = await this.admin
      .from('harassment_reports')
      .select('status, immediate_risk');

    const summary = { submitted: 0, under_review: 0, resolved: 0, declined: 0, high_priority: 0 };
    for (const r of summaryData ?? []) {
      const s = r.status as keyof typeof summary;
      if (s in summary) summary[s]++;
      if (r.immediate_risk) summary.high_priority++;
    }

    const items = (data ?? []).map((r: any) => ({
      ...r,
      preview: r.description ? r.description.slice(0, 200) : null,
    }));

    return {
      success: true,
      data: { summary, items },
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  async getReportDetail(reportId: string) {
    const { data: report, error } = await this.admin
      .from('harassment_reports')
      .select(`
        *,
        reporter:user_profiles!reporter_id(id, username, avatar, email),
        assigned_admin:user_profiles!assigned_to(id, username)
      `)
      .eq('id', reportId)
      .single();

    if (error || !report) throw new NotFoundException('Report not found');

    const { data: timeline } = await this.admin
      .from('report_timeline_events')
      .select('id, event_type, performed_by, created_at, performer:user_profiles!performed_by(id, username)')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    return {
      success: true,
      data: { ...report, timeline: timeline ?? [] },
    };
  }

  /**
   * Single PATCH endpoint: can update status, resolution_action, admin_notes, assigned_to
   */
  async updateReport(
    adminId: string,
    adminUsername: string,
    reportId: string,
    body: {
      status?: string;
      resolution_action?: string;
      admin_notes?: string;
      assigned_to?: string | null;
    },
    ip?: string,
  ) {
    const { data: existing } = await this.admin
      .from('harassment_reports')
      .select('id, status, reporter_id, reference_number')
      .eq('id', reportId)
      .single();

    if (!existing) throw new NotFoundException('Report not found');

    const validStatuses = ['submitted', 'under_review', 'resolved', 'declined'];
    if (body.status && !validStatuses.includes(body.status))
      throw new BadRequestException('Invalid status');
    if (body.status === 'resolved' && !body.resolution_action)
      throw new BadRequestException('resolution_action is required when status is resolved');

    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) update.status = body.status;
    if (body.resolution_action !== undefined) update.resolution_action = body.resolution_action;
    if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;
    if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;
    if (body.status === 'resolved') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = adminId;
    }

    const { error } = await this.admin.from('harassment_reports').update(update).eq('id', reportId);
    if (error) throw new BadRequestException(error.message);

    // Append timeline event on status change
    if (body.status && body.status !== existing.status) {
      await this.admin.from('report_timeline_events').insert({
        id: randomUUID(),
        report_id: reportId,
        event_type: `Status changed to ${body.status}`,
        performed_by: adminId,
        created_at: new Date().toISOString(),
      });
    }

    if (body.assigned_to !== undefined && body.assigned_to !== null) {
      await this.admin.from('report_timeline_events').insert({
        id: randomUUID(),
        report_id: reportId,
        event_type: `Report assigned`,
        performed_by: adminId,
        created_at: new Date().toISOString(),
      });
      // Notify the assigned admin
      await this.admin.from('notifications').insert({
        id: randomUUID(), user_id: body.assigned_to, actor_id: adminId,
        type: 'report_status_update', title: 'Report Assigned',
        message: 'A harassment report has been assigned to you for review.',
        action_url: `/admin/reports/${reportId}`,
        is_read: false, delivery_method: ['in_app'], created_at: new Date().toISOString(),
      });
    }

    // Notify reporter on status change
    if (body.status && existing.reporter_id) {
      await this.admin.from('notifications').insert({
        id: randomUUID(), user_id: existing.reporter_id, actor_id: adminId,
        type: 'report_status_update', title: 'Report Update',
        message: `Your report (${existing.reference_number}) status: ${body.status}`,
        is_read: false, delivery_method: ['in_app'], created_at: new Date().toISOString(),
      });
    }

    await this.adminUsers.logAction(adminId, adminUsername, 'update_report', 'report', reportId, undefined, { ...body }, ip);

    return { success: true, data: { id: reportId, ...update } };
  }

  /**
   * POST /reports/:id/assign — "Assign to me"
   */
  async assignToSelf(adminId: string, adminUsername: string, reportId: string, ip?: string) {
    const { error } = await this.admin
      .from('harassment_reports')
      .update({ assigned_to: adminId, updated_at: new Date().toISOString() })
      .eq('id', reportId);

    if (error) throw new BadRequestException(error.message);

    await this.admin.from('report_timeline_events').insert({
      id: randomUUID(), report_id: reportId,
      event_type: 'Report self-assigned', performed_by: adminId,
      created_at: new Date().toISOString(),
    });

    await this.adminUsers.logAction(adminId, adminUsername, 'assign_report', 'report', reportId, undefined, { assigned_to: adminId }, ip);
    return { success: true, data: { id: reportId, assigned_to: adminId } };
  }
}
