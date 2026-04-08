import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminForumQueryDto } from '../dto/admin-forum-query.dto';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class AdminForumsService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async listForums(query: AdminForumQueryDto) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);

    let q = this.admin
      .from('forums')
      .select(
        'id, name, description, icon, category, is_global, company_name, company_id, member_count, topic_count, moderators, rules, is_locked, is_hidden, created_at',
        { count: 'exact' },
      )
      .is('deleted_at', null)
      .order(query.sortBy ?? 'created_at', {
        ascending: query.sortOrder === 'asc',
      })
      .range(offset, offset + pageSize - 1);

    if (query.type === 'global') q = q.eq('is_global', true);
    else if (query.type === 'company') q = q.eq('is_global', false);
    if (query.search) q = q.ilike('name', `%${query.search}%`);

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    // Enrich moderators + compute posts_this_week
    const weekAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const forums = await Promise.all(
      (data ?? []).map(async (f: any) => {
        let moderatorProfiles: any[] = [];
        if (f.moderators?.length) {
          const { data: mods } = await this.admin
            .from('user_profiles')
            .select('id, username, avatar')
            .in('id', f.moderators);
          moderatorProfiles = mods ?? [];
        }
        const { count: postsThisWeek } = await this.admin
          .from('forum_topics')
          .select('id', { count: 'exact' })
          .eq('forum_id', f.id)
          .gte('created_at', weekAgo);
        return {
          ...f,
          scope: f.is_global ? 'global' : 'company',
          topic_count: f.topic_count ?? 0,
          member_count: f.member_count ?? 0,
          posts_this_week: postsThisWeek ?? 0,
          moderator_profiles: moderatorProfiles,
        };
      }),
    );

    return {
      success: true,
      data: forums,
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  async createForum(
    adminId: string,
    adminUsername: string,
    body: any,
    ip?: string,
  ) {
    const {
      name,
      description,
      icon,
      category,
      scope,
      company_id,
      company_name,
      rules,
      moderator_ids,
    } = body;
    if (!name) throw new BadRequestException('Forum name is required');
    if (scope === 'company' && !company_name)
      throw new BadRequestException(
        'company_name required for company-scoped forums',
      );

    const { data: existing } = await this.admin
      .from('forums')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (existing)
      throw new ConflictException('Forum with this name already exists');

    const { data: forum, error } = await this.admin
      .from('forums')
      .insert({
        name,
        description: description ?? null,
        icon: icon ?? '💬',
        category: category ?? 'General',
        is_global: scope !== 'company',
        company_id: company_id ?? null,
        company_name: company_name ?? null,
        rules: rules ?? [],
        moderators: moderator_ids ?? [],
        member_count: 0,
        topic_count: 0,
        is_locked: false,
        is_hidden: false,
        created_by: adminId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'create_forum',
      'forum',
      forum.id,
      undefined,
      { name },
      ip,
    );
    return { success: true, data: { ...forum, scope: scope ?? 'global' } };
  }

  async updateForum(
    adminId: string,
    adminUsername: string,
    forumId: string,
    body: any,
    ip?: string,
  ) {
    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.category !== undefined) update.category = body.category;
    if (body.rules !== undefined) update.rules = body.rules;
    if (body.moderator_ids !== undefined)
      update.moderators = body.moderator_ids;
    if (body.is_locked !== undefined) update.is_locked = body.is_locked;
    if (body.is_hidden !== undefined) update.is_hidden = body.is_hidden;

    const action =
      body.is_locked !== undefined
        ? body.is_locked
          ? 'lock_forum'
          : 'unlock_forum'
        : body.is_hidden !== undefined
          ? body.is_hidden
            ? 'hide_forum'
            : 'unhide_forum'
          : 'update_forum';

    const { data, error } = await this.admin
      .from('forums')
      .update(update)
      .eq('id', forumId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      action,
      'forum',
      forumId,
      undefined,
      {},
      ip,
    );
    return { success: true, data };
  }

  async deleteForum(
    adminId: string,
    adminUsername: string,
    forumId: string,
    reason: string,
    ip?: string,
  ) {
    const { error } = await this.admin
      .from('forums')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', forumId);
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'delete_forum',
      'forum',
      forumId,
      reason,
      {},
      ip,
    );
    return null;
  }

  async exportForums(
    query: { search?: string; type?: string },
    format: 'csv' | 'pdf',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    let q = this.admin
      .from('forums')
      .select(
        'id, name, description, category, is_global, company_name, member_count, topic_count, is_locked, is_hidden, created_at',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (query.type === 'global') q = q.eq('is_global', true);
    else if (query.type === 'company') q = q.eq('is_global', false);
    if (query.search) q = q.ilike('name', `%${query.search}%`);

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const forums = data ?? [];

    const date = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const headers = [
        'ID',
        'Name',
        'Category',
        'Scope',
        'Company',
        'Members',
        'Topics',
        'Locked',
        'Hidden',
        'Created At',
      ];
      const rows = forums.map((f: any) => [
        f.id,
        f.name,
        f.category || '',
        f.is_global ? 'global' : 'company',
        f.company_name || '',
        f.member_count ?? 0,
        f.topic_count ?? 0,
        f.is_locked ? 'Yes' : 'No',
        f.is_hidden ? 'Yes' : 'No',
        f.created_at,
      ]);
      const csv = [
        headers.join(','),
        ...rows.map((r: any) => r.map((c: any) => `"${c}"`).join(',')),
      ].join('\n');
      return {
        buffer: Buffer.from('\uFEFF' + csv, 'utf-8'),
        filename: `forums-${date}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    // PDFKit
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 40,
        info: {
          Title: 'Forums Export',
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

      doc.rect(0, 0, pw, 60).fill('#2563eb');
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('Forums Export', m, 18);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#bfdbfe')
        .text(
          `Generated: ${new Date().toLocaleString()}  |  Total: ${forums.length}`,
          m,
          40,
        );

      let y = 80;
      const cols = [
        { label: 'Name', w: 160 },
        { label: 'Category', w: 100 },
        { label: 'Scope', w: 70 },
        { label: 'Members', w: 65 },
        { label: 'Topics', w: 65 },
        { label: 'Locked', w: 55 },
        { label: 'Hidden', w: 55 },
        { label: 'Created', w: pw - m * 2 - 570 },
      ];

      const drawHeader = () => {
        doc.rect(m, y, pw - 2 * m, 18).fill('#1e40af');
        let x = m;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
        cols.forEach((col) => {
          doc.text(col.label, x + 4, y + 5, { width: col.w - 8 });
          x += col.w;
        });
        y += 18;
      };
      drawHeader();

      forums.forEach((f: any, i: number) => {
        if (y + 20 > doc.page.height - 40) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
          y = 40;
          drawHeader();
        }
        doc
          .rect(m, y, pw - 2 * m, 20)
          .fill(i % 2 === 0 ? '#ffffff' : '#eff6ff');
        let x = m;
        doc.fontSize(7).font('Helvetica').fillColor('#1f2937');
        const vals = [
          f.name,
          f.category || '-',
          f.is_global ? 'global' : 'company',
          f.member_count ?? 0,
          f.topic_count ?? 0,
          f.is_locked ? 'Yes' : 'No',
          f.is_hidden ? 'Yes' : 'No',
          f.created_at ? new Date(f.created_at).toLocaleDateString() : '-',
        ];
        cols.forEach((col, ci) => {
          doc.text(String(vals[ci]), x + 4, y + 6, { width: col.w - 8 });
          x += col.w;
        });
        y += 20;
      });

      doc.end();
    });

    return {
      buffer,
      filename: `forums-${date}.pdf`,
      contentType: 'application/pdf',
    };
  }
}
