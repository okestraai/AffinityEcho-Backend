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
import { likeText } from '../../../database/query-builder';
import { OTHERS_SPACE, STUDENTS_SPACE } from '../../spaces/spaces.constants';
import { isReservedSpaceName } from '../../../common/constants/onboarding-options';

// Where a forum lives. Global and Shared share one set of names, as members see them together.
interface ForumSpace {
  company_name: string | null;
  is_global: boolean;
  is_shared: boolean;
}

// "global" or an empty value means Global; anything else is a company space or Students.
export function spaceName(space?: string | null): string | null {
  const name = (space ?? '').trim();
  return !name || name.toLowerCase() === 'global' ? null : name;
}

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
        'id, name, description, icon, category, is_global, is_shared, is_other_topics, sort_order, company_name, company_id, member_count, topic_count, moderators, rules, is_locked, is_hidden, created_at',
        { count: 'exact' },
      )
      .is('deleted_at', null);

    // A space tab lists forums in the order members see them.
    if (!query.sortBy && (query.type || query.space)) {
      q = q
        .order('is_other_topics', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    } else {
      q = q.order(query.sortBy ?? 'created_at', {
        ascending: query.sortOrder === 'asc',
      });
    }
    q = q.range(offset, offset + pageSize - 1);

    if (query.type === 'global')
      q = q.eq('is_global', true).eq('is_shared', false);
    else if (query.type === 'shared') q = q.eq('is_shared', true);
    else if (query.type === 'students')
      q = q.eq('company_name', STUDENTS_SPACE);
    else if (query.type === 'company')
      q = q.eq('is_global', false).neq('company_name', STUDENTS_SPACE);
    if (query.space) q = q.eq('company_name', query.space.trim());
    if (query.search) q = q.ilike('name', `%${likeText(query.search)}%`);

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
          scope: f.is_shared
            ? 'shared'
            : f.is_global
              ? 'global'
              : f.company_name === STUDENTS_SPACE
                ? 'students'
                : 'company',
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
    const forumName = typeof name === 'string' ? name.trim() : '';
    if (!forumName) throw new BadRequestException('Forum name is required');
    const where = this.spaceOf(scope, company_name);
    await this.assertNameFree(where, forumName);
    const sortOrder = (await this.lastSortOrder(where)) + 1;

    const { data: forum, error } = await this.admin
      .from('forums')
      .insert({
        name: forumName,
        description: description ?? '',
        icon: icon ?? '💬',
        category: category ?? 'General',
        ...where,
        company_id: company_id ?? null,
        rules: rules ?? [],
        moderators: moderator_ids ?? [],
        sort_order: sortOrder,
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
      {
        name: forumName,
        space: where.company_name ?? (where.is_shared ? 'shared' : 'global'),
      },
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
    const current = await this.getForum(forumId);
    if (
      current.is_other_topics &&
      (body.name !== undefined || body.is_hidden === true)
    ) {
      throw new ConflictException(
        "Other topics can't be renamed or hidden: topics without a forum go there",
      );
    }
    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) {
      const newName = typeof body.name === 'string' ? body.name.trim() : '';
      if (!newName) throw new BadRequestException('Forum name is required');
      await this.assertNameFree(current, newName, forumId);
      update.name = newName;
    }
    if (body.description !== undefined) update.description = body.description;
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.category !== undefined) update.category = body.category;
    if (body.rules !== undefined) update.rules = body.rules;
    if (body.moderator_ids !== undefined)
      update.moderators = body.moderator_ids;
    if (body.sort_order !== undefined) {
      if (!Number.isInteger(body.sort_order) || body.sort_order < 0)
        throw new BadRequestException('sort_order must be a whole number');
      update.sort_order = body.sort_order;
    }
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
    const current = await this.getForum(forumId);
    if (current.is_other_topics)
      throw new ConflictException(
        "Other topics can't be deleted: topics without a forum go there",
      );
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

  // Sets the order of a space's forums; every forum named must be in that space.
  async reorderForums(
    adminId: string,
    adminUsername: string,
    body: { space?: string; shared?: boolean; forum_ids?: string[] },
    ip?: string,
  ) {
    const ids = body.forum_ids;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > 200 ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException('forum_ids must list each forum once');
    const where = body.shared
      ? this.spaceOf('shared')
      : this.spaceOf(
          spaceName(body.space) ? 'company' : 'global',
          spaceName(body.space),
        );
    let q = this.admin
      .from('forums')
      .select('id')
      .in('id', ids)
      .is('deleted_at', null)
      .eq('is_shared', where.is_shared);
    q = where.company_name
      ? q.eq('company_name', where.company_name)
      : q.is('company_name', null);
    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    if ((data ?? []).length !== ids.length)
      throw new BadRequestException(
        'Every forum must be in the space being ordered',
      );

    for (const [index, id] of ids.entries()) {
      await this.admin
        .from('forums')
        .update({ sort_order: index + 1, updated_at: new Date().toISOString() })
        .eq('id', id);
    }
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'reorder_forums',
      'forum',
      ids[0],
      undefined,
      {
        space: where.company_name ?? (where.is_shared ? 'shared' : 'global'),
        forum_ids: ids,
      },
      ip,
    );
    return { success: true, data: { forum_ids: ids } };
  }

  // The most used labels in a space's Other topics.
  async topLabels(space?: string) {
    const otherTopics = await this.otherTopicsForum(spaceName(space));
    const { data, error } = await this.admin
      .from('forum_topics')
      .select('label')
      .eq('forum_id', otherTopics.id)
      .not('label', 'is', null)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(5000);
    if (error) throw new BadRequestException(error.message);
    const counts = new Map<string, { label: string; topics: number }>();
    for (const row of data ?? []) {
      const key = String(row.label).toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.topics += 1;
      else counts.set(key, { label: row.label, topics: 1 });
    }
    return {
      success: true,
      data: [...counts.values()]
        .sort((a, b) => b.topics - a.topics)
        .slice(0, 20),
    };
  }

  // Turns a label into a forum in the same space and moves its topics out of Other topics.
  async promoteLabel(
    adminId: string,
    adminUsername: string,
    body: {
      space?: string;
      label?: string;
      name?: string;
      description?: string;
      icon?: string;
    },
    ip?: string,
  ) {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) throw new BadRequestException('label is required');
    const space = spaceName(body.space);
    const otherTopics = await this.otherTopicsForum(space);

    const created = await this.createForum(
      adminId,
      adminUsername,
      {
        name: body.name?.trim() || label,
        description: body.description ?? '',
        icon: body.icon,
        category: space
          ? space === STUDENTS_SPACE
            ? 'students'
            : 'foundation'
          : 'global',
        scope: space ? 'company' : 'global',
        company_name: space,
      },
      ip,
    );
    const forum = created.data;

    const { data: moved, error } = await this.admin
      .from('forum_topics')
      .update({ forum_id: forum.id })
      .eq('forum_id', otherTopics.id)
      .ilike('label', likeText(label))
      .select('id');
    if (error) throw new BadRequestException(error.message);
    const topicsMoved = (moved ?? []).length;

    await this.recountTopics(forum.id);
    await this.recountTopics(otherTopics.id);
    await this.adminUsers.logAction(
      adminId,
      adminUsername,
      'promote_label',
      'forum',
      forum.id,
      undefined,
      { label, space: space ?? 'global', topics_moved: topicsMoved },
      ip,
    );
    return { success: true, data: { forum, topics_moved: topicsMoved } };
  }

  private spaceOf(scope?: string, companyName?: string | null): ForumSpace {
    if (scope === 'shared')
      return { company_name: null, is_global: true, is_shared: true };
    if (scope === 'students')
      return {
        company_name: STUDENTS_SPACE,
        is_global: false,
        is_shared: false,
      };
    if (scope === 'company') {
      const name = (companyName ?? '').trim();
      if (!name)
        throw new BadRequestException(
          'company_name required for company-scoped forums',
        );
      // Students and Others are built-in spaces; any other reserved name is refused.
      const known = [STUDENTS_SPACE, OTHERS_SPACE].find(
        (s) => s.toLowerCase() === name.toLowerCase(),
      );
      if (!known && isReservedSpaceName(name))
        throw new BadRequestException(
          `"${name}" can't be used as a space name`,
        );
      return {
        company_name: known ?? name,
        is_global: false,
        is_shared: false,
      };
    }
    return { company_name: null, is_global: true, is_shared: false };
  }

  // Names are unique within a space, ignoring case.
  private async assertNameFree(
    where: Pick<ForumSpace, 'company_name'>,
    name: string,
    exceptId?: string,
  ) {
    let q = this.admin
      .from('forums')
      .select('id')
      .ilike('name', likeText(name))
      .is('deleted_at', null);
    q = where.company_name
      ? q.eq('company_name', where.company_name)
      : q.is('company_name', null);
    if (exceptId) q = q.neq('id', exceptId);
    const { data, error } = await q.limit(1);
    if (error) throw new BadRequestException(error.message);
    if ((data ?? []).length)
      throw new ConflictException(
        'A forum with this name already exists in this space',
      );
  }

  private async lastSortOrder(where: ForumSpace): Promise<number> {
    let q = this.admin
      .from('forums')
      .select('sort_order')
      .is('deleted_at', null)
      .eq('is_shared', where.is_shared)
      .eq('is_other_topics', false)
      .order('sort_order', { ascending: false })
      .limit(1);
    q = where.company_name
      ? q.eq('company_name', where.company_name)
      : q.is('company_name', null);
    const { data } = await q;
    return data?.[0]?.sort_order ?? 0;
  }

  private async getForum(forumId: string) {
    const { data, error } = await this.admin
      .from('forums')
      .select('id, name, company_name, is_global, is_shared, is_other_topics')
      .eq('id', forumId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Forum not found');
    return data;
  }

  private async otherTopicsForum(space: string | null) {
    let q = this.admin
      .from('forums')
      .select('id')
      .eq('is_other_topics', true)
      .is('deleted_at', null);
    q = space ? q.eq('company_name', space) : q.is('company_name', null);
    const { data } = await q.maybeSingle();
    if (!data)
      throw new NotFoundException('This space has no Other topics forum');
    return data;
  }

  private async recountTopics(forumId: string) {
    const { count } = await this.admin
      .from('forum_topics')
      .select('id', { count: 'exact' })
      .eq('forum_id', forumId)
      .or('is_deleted.is.null,is_deleted.eq.false');
    await this.admin
      .from('forums')
      .update({ topic_count: count ?? 0 })
      .eq('id', forumId);
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
    if (query.search) q = q.ilike('name', `%${likeText(query.search)}%`);

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
