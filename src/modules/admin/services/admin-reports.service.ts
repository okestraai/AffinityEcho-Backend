import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import {
  AdminReportQueryDto,
  INCIDENT_TYPES,
} from '../dto/admin-report-query.dto';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class AdminReportsService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Validate incident type against frontend constants
   */
  private validateIncidentType(type: string): boolean {
    return INCIDENT_TYPES.includes(type as any);
  }

  /**
   * Build base query with filters (reusable for list and export)
   */
  private buildBaseQuery(query: AdminReportQueryDto, adminId?: string) {
    let q = this.admin.from('harassment_reports').select(
      `id, reference_number, incident_type, status, immediate_risk, description,
         created_at, updated_at, assigned_to, reported_user_id, location, witnesses, evidence,
         reporter:user_profiles!harassment_reports_reporter_id_fkey(id, username, avatar, email),
         reported_user:user_profiles!harassment_reports_reported_user_id_fkey(id, username, avatar, email)`,
      { count: 'exact' },
    );

    // Status filter
    if (query.status) {
      const validStatuses = [
        'submitted',
        'under_review',
        'resolved',
        'declined',
      ];
      if (validStatuses.includes(query.status)) {
        q = q.eq('status', query.status);
      }
    }

    // Type filter - validates against frontend incident types
    if (query.type) {
      if (this.validateIncidentType(query.type)) {
        q = q.eq('incident_type', query.type);
      } else {
        throw new BadRequestException(
          `Invalid incident type. Must be one of: ${INCIDENT_TYPES.join(', ')}`,
        );
      }
    }

    // Priority filtering
    if (query.priority === 'critical') {
      q = q.eq('immediate_risk', true);
    } else if (query.priority === 'high') {
      q = q.eq('immediate_risk', false).eq('status', 'submitted');
    } else if (query.priority === 'medium') {
      q = q.eq('immediate_risk', false).eq('status', 'under_review');
    } else if (query.priority === 'low') {
      q = q.eq('immediate_risk', false).in('status', ['resolved', 'declined']);
    }

    // Assignment filter
    if (query.assignedTo === 'me' && adminId) {
      q = q.eq('assigned_to', adminId);
    } else if (query.assignedTo === 'unassigned') {
      q = q.is('assigned_to', null);
    } else if (query.assignedTo) {
      q = q.eq('assigned_to', query.assignedTo);
    }

    return q;
  }

  async listReports(adminId: string, query: AdminReportQueryDto) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);
    const sortBy = query.sortBy ?? 'created_at';
    const ascending = query.sortOrder === 'asc';

    const q = this.buildBaseQuery(query, adminId)
      .order(sortBy, { ascending })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    // Summary counts across ALL reports (ignoring current filters)
    const { data: summaryData } = await this.admin
      .from('harassment_reports')
      .select('status, immediate_risk');

    const summary = {
      submitted: 0,
      under_review: 0,
      resolved: 0,
      declined: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const r of summaryData ?? []) {
      const s = r.status as keyof typeof summary;
      if (s in summary) summary[s]++;

      // Calculate priority
      if (r.immediate_risk) {
        summary.critical++;
      } else if (r.status === 'submitted') {
        summary.high++;
      } else if (r.status === 'under_review') {
        summary.medium++;
      } else if (r.status === 'resolved' || r.status === 'declined') {
        summary.low++;
      }
    }

    // Batch-fetch assigned admin usernames
    const assignedIds = (data ?? [])
      .map((r: any) => r.assigned_to)
      .filter((id: string | null) => id != null);
    const assignedMap = await this.fetchUsernames(assignedIds);

    const items = (data ?? []).map((r: any) => {
      // Determine priority
      let priority = 'low';
      if (r.immediate_risk) {
        priority = 'critical';
      } else if (r.status === 'submitted') {
        priority = 'high';
      } else if (r.status === 'under_review') {
        priority = 'medium';
      }

      return {
        ...r,
        assigned_admin: r.assigned_to
          ? {
              id: r.assigned_to,
              username: assignedMap.get(r.assigned_to) || 'Unknown',
            }
          : null,
        priority,
        preview: r.description ? r.description.slice(0, 200) : null,
      };
    });

    return {
      success: true,
      data: { summary, items },
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  /**
   * Export reports to CSV or PDF
   */
  async exportReports(
    _adminId: string,
    query: AdminReportQueryDto,
    format: 'csv' | 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    // Build query without pagination for full export
    const sortBy = query.sortBy ?? 'created_at';
    const ascending = query.sortOrder === 'asc';

    const q = this.buildBaseQuery(query, _adminId).order(sortBy, { ascending });

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);

    // Batch-fetch assigned admin usernames for export
    const assignedIds = (data ?? [])
      .map((r: any) => r.assigned_to)
      .filter((id: string | null) => id != null);
    const assignedMap = await this.fetchUsernames(assignedIds);

    const reports = (data ?? []).map((r: any) => {
      let priority = 'low';
      if (r.immediate_risk) {
        priority = 'critical';
      } else if (r.status === 'submitted') {
        priority = 'high';
      } else if (r.status === 'under_review') {
        priority = 'medium';
      }

      return {
        ...r,
        priority,
        reporter_name: r.reporter?.username || 'Anonymous',
        reporter_email: r.reporter?.email || 'N/A',
        assigned_to_name: r.assigned_to
          ? assignedMap.get(r.assigned_to) || 'Unknown'
          : 'Unassigned',
        reported_user_name: r.reported_user?.username || 'Unknown',
      };
    });

    if (format === 'csv') {
      return this.generateCSV(reports, query);
    } else {
      return this.generatePDF(reports, query);
    }
  }

  /**
   * Generate CSV export
   */
  private generateCSV(
    reports: any[],
    query: AdminReportQueryDto,
  ): { buffer: Buffer; filename: string; contentType: string } {
    // CSV Headers
    const headers = [
      'Reference Number',
      'Incident Type',
      'Status',
      'Priority',
      'Immediate Risk',
      'Reporter',
      'Reporter Email',
      'Reported User',
      'Assigned To',
      'Date Created',
      'Date Updated',
      'Location',
      'Witnesses',
      'Evidence',
      'Description',
      'Resolution Action',
      'Admin Notes',
    ];

    // Map data to rows
    const rows = reports.map((r) => [
      r.reference_number,
      r.incident_type,
      r.status,
      r.priority,
      r.immediate_risk ? 'Yes' : 'No',
      r.reporter_name,
      r.reporter_email,
      r.reported_user_name,
      r.assigned_to_name,
      r.created_at,
      r.updated_at,
      r.location || '',
      this.escapeCSV(r.witnesses || ''),
      this.escapeCSV(r.evidence || ''),
      this.escapeCSV(r.description || ''),
      r.resolution_action || '',
      this.escapeCSV(r.admin_notes || ''),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const timestamp = new Date().toISOString().split('T')[0];
    const filters = this.buildFilterString(query);
    const filename = `harassment-reports${filters}-${timestamp}.csv`;

    return {
      buffer: Buffer.from('\uFEFF' + csvContent, 'utf-8'), // BOM for Excel compatibility
      filename,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  /**
   * Escape CSV fields to handle quotes and newlines
   */
  private escapeCSV(str: string): string {
    if (!str) return '';
    return str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
  }

  /**
   * Generate PDF export using PDFKit
   */
  private async generatePDF(
    reports: any[],
    query: AdminReportQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const filters = this.buildFilterString(query);
    const date = new Date().toISOString().split('T')[0];

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        info: {
          Title: 'Harassment Reports Export',
          Author: 'AffinityEcho Admin Portal',
          Subject: 'Harassment Reports Data Export',
          CreationDate: new Date(),
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const margin = 40;

      // Header background
      doc.rect(0, 0, pageWidth, 70).fill('#dc2626');

      // Title
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('Harassment Reports Export', margin, 20);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#fecaca')
        .text('CONFIDENTIAL — AUTHORIZED PERSONNEL ONLY', margin, 44);

      const metadataX = pageWidth - margin - 200;
      doc
        .fontSize(9)
        .fillColor('#fecaca')
        .text(
          `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
          metadataX,
          20,
          { width: 200, align: 'right' },
        )
        .text(`Total: ${reports.length} reports`, metadataX, 34, {
          width: 200,
          align: 'right',
        });

      let y = 90;

      // Summary stats box
      const critical = reports.filter((r) => r.priority === 'critical').length;
      const high = reports.filter((r) => r.priority === 'high').length;
      const medium = reports.filter((r) => r.priority === 'medium').length;
      const low = reports.filter((r) => r.priority === 'low').length;
      const immediateRisk = reports.filter((r) => r.immediate_risk).length;

      const summaryBoxHeight = 55;
      doc
        .rect(margin, y, pageWidth - 2 * margin, summaryBoxHeight)
        .fill('#fef2f2');
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#991b1b')
        .text('PRIORITY DISTRIBUTION', margin + 10, y + 8);

      const statW = (pageWidth - 2 * margin - 20) / 5;
      const stats = [
        { label: 'CRITICAL', value: critical, color: '#dc2626' },
        { label: 'HIGH', value: high, color: '#ea580c' },
        { label: 'MEDIUM', value: medium, color: '#ca8a04' },
        { label: 'LOW', value: low, color: '#16a34a' },
        { label: 'IMM. RISK', value: immediateRisk, color: '#7c3aed' },
      ];

      stats.forEach((stat, i) => {
        const sx = margin + 10 + i * statW;
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor(stat.color)
          .text(String(stat.value), sx, y + 20, { width: statW - 5 });
        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#6b7280')
          .text(stat.label, sx, y + 40, { width: statW - 5 });
      });

      y += summaryBoxHeight + 15;

      // Table columns
      const cols = [
        { label: 'Ref #', width: 70 },
        { label: 'Incident Type', width: 110 },
        { label: 'Status', width: 80 },
        { label: 'Priority', width: 65 },
        { label: 'Reporter', width: 110 },
        { label: 'Date', width: 80 },
        { label: 'Description', width: pageWidth - 2 * margin - 515 },
      ];

      // Table header
      doc.rect(margin, y, pageWidth - 2 * margin, 18).fill('#7f1d1d');
      let x = margin;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      cols.forEach((col) => {
        doc.text(col.label, x + 4, y + 5, { width: col.width - 8 });
        x += col.width;
      });
      y += 18;

      const priorityColors: Record<string, string> = {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#ca8a04',
        low: '#16a34a',
      };

      // Table rows
      reports.forEach((r, idx) => {
        const rowHeight = 22;

        if (y + rowHeight > doc.page.height - 50) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
          y = 40;
          // Re-draw header
          doc.rect(margin, y, pageWidth - 2 * margin, 18).fill('#7f1d1d');
          let hx = margin;
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
          cols.forEach((col) => {
            doc.text(col.label, hx + 4, y + 5, { width: col.width - 8 });
            hx += col.width;
          });
          y += 18;
        }

        // Alternating row background
        doc
          .rect(margin, y, pageWidth - 2 * margin, rowHeight)
          .fill(idx % 2 === 0 ? '#ffffff' : '#fef9f9');

        let cx = margin;
        doc.fontSize(7).font('Helvetica').fillColor('#1f2937');

        const refNum = r.reference_number || '-';
        doc
          .font('Helvetica-Bold')
          .text(refNum, cx + 4, y + 7, { width: cols[0].width - 8 });
        cx += cols[0].width;

        doc.font('Helvetica').text(r.incident_type || '-', cx + 4, y + 7, {
          width: cols[1].width - 8,
        });
        cx += cols[1].width;

        const statusColor =
          r.status === 'submitted'
            ? '#92400e'
            : r.status === 'under_review'
              ? '#1e40af'
              : r.status === 'resolved'
                ? '#065f46'
                : '#374151';
        doc
          .fillColor(statusColor)
          .text(
            (r.status || '-').replace('_', ' ').toUpperCase(),
            cx + 4,
            y + 7,
            { width: cols[2].width - 8 },
          );
        cx += cols[2].width;

        doc
          .fillColor(priorityColors[r.priority] || '#374151')
          .font('Helvetica-Bold')
          .text((r.priority || '-').toUpperCase(), cx + 4, y + 7, {
            width: cols[3].width - 8,
          });
        cx += cols[3].width;

        doc
          .fillColor('#1f2937')
          .font('Helvetica')
          .text(r.reporter_name || 'Anonymous', cx + 4, y + 7, {
            width: cols[4].width - 8,
          });
        cx += cols[4].width;

        const dateStr = r.created_at
          ? new Date(r.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '-';
        doc.text(dateStr, cx + 4, y + 7, { width: cols[5].width - 8 });
        cx += cols[5].width;

        const desc = (r.description || '').substring(0, 100);
        doc.text(desc, cx + 4, y + 7, { width: cols[6].width - 8 });

        y += rowHeight;
      });

      // Footer
      y += 10;
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#9ca3af')
        .text(
          'CONFIDENTIAL DOCUMENT — HR DEPARTMENT — Subject to privacy laws and company policy.',
          margin,
          y,
          { width: pageWidth - 2 * margin, align: 'center' },
        );

      doc.end();
    });

    return {
      buffer,
      filename: `harassment-reports${filters}-${date}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /**
   * Build filter string for filename
   */
  private buildFilterString(query: AdminReportQueryDto): string {
    const parts: string[] = [];
    if (query.status) parts.push(query.status);
    if (query.priority) parts.push(query.priority);
    if (query.type) parts.push(query.type.replace(/\s+/g, '-').toLowerCase());
    if (query.assignedTo) parts.push(query.assignedTo);

    return parts.length > 0 ? `-${parts.join('-')}` : '';
  }

  async getReportDetail(reportId: string) {
    const { data: report, error } = await this.admin
      .from('harassment_reports')
      .select(
        `
      *,
      reporter:user_profiles!harassment_reports_reporter_id_fkey(id, username, avatar, email),
      reported_user:user_profiles!harassment_reports_reported_user_id_fkey(id, username, avatar, email, role)
    `,
      )
      .eq('id', reportId)
      .single();

    if (error || !report) throw new NotFoundException('Report not found');

    // Determine priority
    let priority = 'low';
    if (report.immediate_risk) {
      priority = 'critical';
    } else if (report.status === 'submitted') {
      priority = 'high';
    } else if (report.status === 'under_review') {
      priority = 'medium';
    }

    const { data: timeline } = await this.admin
      .from('report_timeline_events')
      .select(
        'id, event_type, performed_by, created_at, performer:user_profiles!performed_by(id, username)',
      )
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    // Fetch assigned admin separately to avoid Supabase FK alias issue
    let assignedAdmin = null;
    if (report.assigned_to) {
      const { data: admin } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar')
        .eq('id', report.assigned_to)
        .single();
      assignedAdmin = admin;
    }

    return {
      success: true,
      data: {
        ...report,
        assigned_admin: assignedAdmin,
        priority,
        timeline: timeline ?? [],
      },
    };
  }

  /**
   * Single PATCH endpoint: can update status, resolution_action, admin_notes, assigned_to, reported_user_id
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
      reported_user_id?: string | null;
    },
    ip?: string,
  ) {
    const { data: existing } = await this.admin
      .from('harassment_reports')
      .select('id, status, reporter_id, reference_number, reported_user_id')
      .eq('id', reportId)
      .single();

    if (!existing) throw new NotFoundException('Report not found');

    const validStatuses = ['submitted', 'under_review', 'resolved', 'declined'];
    if (body.status && !validStatuses.includes(body.status))
      throw new BadRequestException('Invalid status');
    if (body.status === 'resolved' && !body.resolution_action)
      throw new BadRequestException(
        'resolution_action is required when status is resolved',
      );

    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (body.status !== undefined) update.status = body.status;
    if (body.resolution_action !== undefined)
      update.resolution_action = body.resolution_action;
    if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;
    if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;
    if (body.reported_user_id !== undefined)
      update.reported_user_id = body.reported_user_id;
    if (body.status === 'resolved') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = adminId;
    }

    const { error } = await this.admin
      .from('harassment_reports')
      .update(update)
      .eq('id', reportId);
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

    // Timeline event for reported user change
    if (
      body.reported_user_id !== undefined &&
      body.reported_user_id !== existing.reported_user_id
    ) {
      await this.admin.from('report_timeline_events').insert({
        id: randomUUID(),
        report_id: reportId,
        event_type: body.reported_user_id
          ? 'Reported user updated'
          : 'Reported user removed',
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
        id: randomUUID(),
        user_id: body.assigned_to,
        actor_id: adminId,
        type: 'report_status_update',
        title: 'Report Assigned',
        message: 'A harassment report has been assigned to you for review.',
        action_url: `/admin/reports/${reportId}`,
        is_read: false,
        delivery_method: ['in_app'],
        created_at: new Date().toISOString(),
      });
    }

    // Notify reporter on status change
    if (body.status && existing.reporter_id) {
      await this.admin.from('notifications').insert({
        id: randomUUID(),
        user_id: existing.reporter_id,
        actor_id: adminId,
        type: 'report_status_update',
        title: 'Report Update',
        message: `Your report (${existing.reference_number}) status: ${body.status}`,
        is_read: false,
        delivery_method: ['in_app'],
        created_at: new Date().toISOString(),
      });
    }

    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'update_report',
      'report',
      reportId,
      undefined,
      { ...body },
      ip,
    );

    // Fetch updated reported_user info if it was changed
    let reportedUser = null;
    if (body.reported_user_id !== undefined && body.reported_user_id) {
      const { data: userData } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar')
        .eq('id', body.reported_user_id)
        .single();
      reportedUser = userData;
    }

    return {
      success: true,
      data: {
        id: reportId,
        ...update,
        reported_user: reportedUser,
      },
    };
  }

  /**
   * POST /reports/:id/assign — "Assign to me"
   */
  async assignToSelf(
    adminId: string,
    adminUsername: string,
    reportId: string,
    ip?: string,
  ) {
    const { error } = await this.admin
      .from('harassment_reports')
      .update({ assigned_to: adminId, updated_at: new Date().toISOString() })
      .eq('id', reportId);

    if (error) throw new BadRequestException(error.message);

    await this.admin.from('report_timeline_events').insert({
      id: randomUUID(),
      report_id: reportId,
      event_type: 'Report self-assigned',
      performed_by: adminId,
      created_at: new Date().toISOString(),
    });

    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'assign_report',
      'report',
      reportId,
      undefined,
      { assigned_to: adminId },
      ip,
    );

    return {
      success: true,
      data: {
        id: reportId,
        assigned_to: adminId,
        assigned_admin: { id: adminId, username: adminUsername },
      },
    };
  }

  private async fetchUsernames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const unique = [...new Set(ids)];
    const { data } = await this.admin
      .from('user_profiles')
      .select('id, username')
      .in('id', unique);
    (data || []).forEach((u: any) => map.set(u.id, u.username));
    return map;
  }
}
