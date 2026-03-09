import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class AdminNooksService {
  private admin;

  constructor(private config: ConfigService, private adminUsers: AdminUsersService) {
    this.admin = supabaseAdmin(config);
  }

  async listNooks(query: { page?: string; limit?: string; search?: string; scope?: string; is_locked?: string; is_hidden?: string }) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let q = this.admin
      .from('nooks')
      .select(
        `id, title, description, scope, is_locked, is_hidden, creator_id, members_count, created_at, expires_at,
         creator:user_profiles!creator_id(id, username, avatar)`,
        { count: 'exact' },
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (query.search) q = q.ilike('title', `%${query.search}%`);
    if (query.scope) q = q.eq('scope', query.scope);
    if (query.is_locked !== undefined) q = q.eq('is_locked', query.is_locked === 'true');
    if (query.is_hidden !== undefined) q = q.eq('is_hidden', query.is_hidden === 'true');

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    // Enrich with message_count and messages_this_week
    const nooks = await Promise.all((data ?? []).map(async (n: any) => {
      const [msgCount, msgWeek] = await Promise.all([
        this.admin.from('nook_messages').select('id', { count: 'exact' }).eq('nook_id', n.id),
        this.admin.from('nook_messages').select('id', { count: 'exact' }).eq('nook_id', n.id).gte('created_at', weekAgo),
      ]);
      return {
        ...n,
        message_count: msgCount.count ?? 0,
        messages_this_week: msgWeek.count ?? 0,
      };
    }));

    // Summary
    const { data: allNooks } = await this.admin.from('nooks').select('scope, is_locked').is('deleted_at', null);
    const summary = { total: count ?? 0, public: 0, private: 0, company: 0, locked: 0 };
    for (const n of allNooks ?? []) {
      if (n.scope === 'public') summary.public++;
      else if (n.scope === 'private') summary.private++;
      else if (n.scope === 'company') summary.company++;
      if (n.is_locked) summary.locked++;
    }

    return {
      success: true,
      data: { summary, items: nooks },
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  async createNook(adminId: string, adminUsername: string, body: any, ip?: string) {
    const { name, description, scope } = body;
    if (!name) throw new BadRequestException('Nook name is required');

    const { data: existing } = await this.admin.from('nooks').select('id').eq('title', name).maybeSingle();
    if (existing) throw new ConflictException('Nook with this name already exists');

    const { data: nook, error } = await this.admin.from('nooks').insert({
      title: name, description: description ?? null,
      scope: scope ?? 'public',
      creator_id: adminId,
      is_locked: false, is_hidden: false,
      members_count: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, 'create_nook', 'nook', nook.id, undefined, { name }, ip);
    return { success: true, data: nook };
  }

  async updateNook(adminId: string, adminUsername: string, nookId: string, body: any, ip?: string) {
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.title = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.scope !== undefined) update.scope = body.scope;
    if (body.is_locked !== undefined) update.is_locked = body.is_locked;
    if (body.is_hidden !== undefined) update.is_hidden = body.is_hidden;

    const { data, error } = await this.admin.from('nooks').update(update).eq('id', nookId).select().single();
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, 'update_nook', 'nook', nookId, undefined, {}, ip);
    return { success: true, data };
  }

  async deleteNook(adminId: string, adminUsername: string, adminRole: string, nookId: string, reason: string, ip?: string) {
    if (adminRole !== 'super_admin' && adminRole !== 'admin') throw new BadRequestException('Admin role required');
    const { error } = await this.admin.from('nooks').update({ deleted_at: new Date().toISOString() }).eq('id', nookId);
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, 'delete_nook', 'nook', nookId, reason, {}, ip);
    return null;
  }

  async removeMember(adminId: string, adminUsername: string, nookId: string, userId: string, reason: string, ip?: string) {
    const { error } = await this.admin.from('nook_members').delete().eq('nook_id', nookId).eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, 'remove_nook_member', 'nook', nookId, reason, { user_id: userId }, ip);
    return { success: true, data: null };
  }

  async exportNooks(
    query: { search?: string; scope?: string; is_locked?: string },
    format: 'csv' | 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    let q = this.admin
      .from('nooks')
      .select('id, title, description, scope, is_locked, is_hidden, members_count, created_at, expires_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (query.search) q = q.ilike('title', `%${query.search}%`);
    if (query.scope) q = q.eq('scope', query.scope);
    if (query.is_locked !== undefined) q = q.eq('is_locked', query.is_locked === 'true');

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const nooks = data ?? [];

    const date = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const headers = ['ID', 'Title', 'Scope', 'Members', 'Locked', 'Hidden', 'Created At', 'Expires At'];
      const rows = nooks.map((n: any) => [
        n.id, n.title, n.scope || 'public', n.members_count ?? 0,
        n.is_locked ? 'Yes' : 'No', n.is_hidden ? 'Yes' : 'No',
        n.created_at, n.expires_at || '',
      ]);
      const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((c) => `"${c}"`).join(','))].join('\n');
      return {
        buffer: Buffer.from('\uFEFF' + csv, 'utf-8'),
        filename: `nooks-${date}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, info: { Title: 'Nooks Export', Author: 'AffinityEcho Admin', CreationDate: new Date() } });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pw = doc.page.width;
      const m = 40;

      doc.rect(0, 0, pw, 60).fill('#0f766e');
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff').text('Nooks Export', m, 18);
      doc.fontSize(9).font('Helvetica').fillColor('#99f6e4')
        .text(`Generated: ${new Date().toLocaleString()}  |  Total: ${nooks.length}`, m, 40);

      let y = 80;
      const cols = [
        { label: 'Title', w: 200 },
        { label: 'Scope', w: 70 },
        { label: 'Members', w: 70 },
        { label: 'Locked', w: 60 },
        { label: 'Hidden', w: 60 },
        { label: 'Created', w: 100 },
        { label: 'Expires', w: pw - m * 2 - 560 },
      ];

      const drawHeader = () => {
        doc.rect(m, y, pw - 2 * m, 18).fill('#134e4a');
        let x = m;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
        cols.forEach((col) => { doc.text(col.label, x + 4, y + 5, { width: col.w - 8 }); x += col.w; });
        y += 18;
      };
      drawHeader();

      nooks.forEach((n: any, i: number) => {
        if (y + 20 > doc.page.height - 40) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 }); y = 40; drawHeader(); }
        doc.rect(m, y, pw - 2 * m, 20).fill(i % 2 === 0 ? '#ffffff' : '#f0fdfa');
        let x = m;
        doc.fontSize(7).font('Helvetica').fillColor('#1f2937');
        const vals = [n.title, n.scope || 'public', n.members_count ?? 0,
          n.is_locked ? 'Yes' : 'No', n.is_hidden ? 'Yes' : 'No',
          n.created_at ? new Date(n.created_at).toLocaleDateString() : '-',
          n.expires_at ? new Date(n.expires_at).toLocaleDateString() : 'Never'];
        cols.forEach((col, ci) => { doc.text(String(vals[ci]), x + 4, y + 6, { width: col.w - 8 }); x += col.w; });
        y += 20;
      });

      doc.end();
    });

    return { buffer, filename: `nooks-${date}.pdf`, contentType: 'application/pdf' };
  }
}
