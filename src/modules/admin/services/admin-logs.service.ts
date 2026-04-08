import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { buildMeta, parsePagination } from '../admin.helpers';
import PDFDocument from 'pdfkit';

@Injectable()
export class AdminLogsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getLogs(query: {
    page?: string;
    limit?: string;
    search?: string;
    adminId?: string;
    action?: string;
    targetType?: string;
    from?: string;
    to?: string;
    sortDir?: string;
  }) {
    const { page, pageSize, offset } = parsePagination(
      query.page,
      query.limit,
      10,
      200,
    );
    const ascending = query.sortDir === 'asc';

    let q = this.admin
      .from('admin_logs')
      .select(
        `id, action, target_type, target_id, reason, metadata, ip_address, created_at, admin_username,
         admin:user_profiles!admin_id(id, username, avatar)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending })
      .range(offset, offset + pageSize - 1);

    if (query.adminId) q = q.eq('admin_id', query.adminId);
    if (query.action) q = q.eq('action', query.action);
    if (query.targetType) q = q.eq('target_type', query.targetType);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);
    if (query.search) {
      q = q.or(
        `admin_username.ilike.%${query.search}%,action.ilike.%${query.search}%,reason.ilike.%${query.search}%`,
      );
    }

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    return {
      success: true,
      data: data ?? [],
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  async exportLogs(
    query: {
      search?: string;
      adminId?: string;
      action?: string;
      targetType?: string;
      from?: string;
      to?: string;
    },
    format: 'csv' | 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    let q = this.admin
      .from('admin_logs')
      .select(
        'id, action, admin_username, target_type, target_id, reason, ip_address, created_at',
      )
      .order('created_at', { ascending: false });

    if (query.adminId) q = q.eq('admin_id', query.adminId);
    if (query.action) q = q.eq('action', query.action);
    if (query.targetType) q = q.eq('target_type', query.targetType);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);
    if (query.search) {
      q = q.or(
        `admin_username.ilike.%${query.search}%,action.ilike.%${query.search}%,reason.ilike.%${query.search}%`,
      );
    }

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const logs = data ?? [];

    const date = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const headers = [
        'ID',
        'Action',
        'Admin',
        'Target Type',
        'Target ID',
        'Reason',
        'IP Address',
        'Created At',
      ];
      const rows = logs.map((l: any) => [
        l.id,
        l.action,
        l.admin_username || '-',
        l.target_type || '-',
        l.target_id || '-',
        (l.reason || '').replace(/"/g, '""'),
        l.ip_address || '-',
        l.created_at,
      ]);
      const csv = [
        headers.join(','),
        ...rows.map((r: any[]) => r.map((c) => `"${c}"`).join(',')),
      ].join('\n');
      return {
        buffer: Buffer.from('\uFEFF' + csv, 'utf-8'),
        filename: `audit-logs-${date}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        info: {
          Title: 'Audit Logs Export',
          Author: 'AffinityEcho Admin',
          CreationDate: new Date(),
        },
      });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pw = doc.page.width;
      const m = 40;

      doc.rect(0, 0, pw, 60).fill('#374151');
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('Audit Logs Export', m, 18);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#d1d5db')
        .text(
          `Generated: ${new Date().toLocaleString()}  |  Total: ${logs.length} entries`,
          m,
          40,
        );

      let y = 80;
      const cols = [
        { label: 'Action', w: 140 },
        { label: 'Admin', w: 110 },
        { label: 'Target Type', w: 90 },
        { label: 'Target ID', w: 140 },
        { label: 'IP Address', w: 100 },
        { label: 'Date', w: pw - m * 2 - 580 },
      ];

      const drawHeader = () => {
        doc.rect(m, y, pw - 2 * m, 18).fill('#1f2937');
        let x = m;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
        cols.forEach((col) => {
          doc.text(col.label, x + 4, y + 5, { width: col.w - 8 });
          x += col.w;
        });
        y += 18;
      };
      drawHeader();

      logs.forEach((l: any, i: number) => {
        if (y + 20 > doc.page.height - 40) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
          y = 40;
          drawHeader();
        }
        doc
          .rect(m, y, pw - 2 * m, 20)
          .fill(i % 2 === 0 ? '#ffffff' : '#f9fafb');
        let x = m;
        doc.fontSize(7).fillColor('#1f2937');
        doc
          .font('Helvetica-Bold')
          .text(l.action || '-', x + 4, y + 6, { width: cols[0].w - 8 });
        x += cols[0].w;
        doc.font('Helvetica').text(l.admin_username || '-', x + 4, y + 6, {
          width: cols[1].w - 8,
        });
        x += cols[1].w;
        doc.text(l.target_type || '-', x + 4, y + 6, { width: cols[2].w - 8 });
        x += cols[2].w;
        doc
          .fontSize(6)
          .text(l.target_id || '-', x + 4, y + 7, { width: cols[3].w - 8 });
        x += cols[3].w;
        doc
          .fontSize(7)
          .text(l.ip_address || '-', x + 4, y + 6, { width: cols[4].w - 8 });
        x += cols[4].w;
        doc.text(
          l.created_at ? new Date(l.created_at).toLocaleDateString() : '-',
          x + 4,
          y + 6,
          { width: cols[5].w - 8 },
        );
        y += 20;
      });

      doc.end();
    });

    return {
      buffer,
      filename: `audit-logs-${date}.pdf`,
      contentType: 'application/pdf',
    };
  }
}
