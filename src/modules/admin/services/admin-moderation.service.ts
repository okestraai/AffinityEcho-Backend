import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { AdminModerationQueryDto } from '../dto/admin-moderation-query.dto';
import { buildMeta, parsePagination } from '../admin.helpers';
import { AdminUsersService } from './admin-users.service';

// Maps API type names to their source tables and content column
const CONTENT_CONFIG: Record<string, { table: string; contentCol: string }> = {
  post: { table: 'feed_posts', contentCol: 'content' },
  comment: { table: 'forum_comments', contentCol: 'content' },
  nook_message: { table: 'nook_messages', contentCol: 'content' },
};

@Injectable()
export class AdminModerationService {
  private admin;

  constructor(
    private config: ConfigService,
    private adminUsers: AdminUsersService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async listContent(query: AdminModerationQueryDto) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit);
    const type = query.type; // optional — if omitted, merge all types

    // Build unified result from content_moderation + source tables
    const types = type ? [type] : ['post', 'comment', 'nook_message'];

    let cmQuery = this.admin
      .from('content_moderation')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (type) cmQuery = cmQuery.eq('content_type', type);
    if (query.status) cmQuery = cmQuery.eq('moderation_status', query.status);
    if (query.flagged === 'true') cmQuery = cmQuery.gt('reports_count', 0);

    const { data: cmRows, count, error: cmError } = await cmQuery;
    if (cmError) throw new BadRequestException(cmError.message);

    // Enrich with source content and author
    const items = await Promise.all(
      (cmRows ?? []).map(async (cm: any) => {
        const cfg = CONTENT_CONFIG[cm.content_type];
        if (!cfg) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: source } = await (this.admin as any)
          .from(cfg.table)
          .select(`${cfg.contentCol}, user_id, created_at`)
          .eq('id', cm.content_id)
          .single();

        let author: any = { id: (source as any)?.user_id };
        if ((source as any)?.user_id) {
          const { data: u } = await this.admin
            .from('user_profiles')
            .select('id, username, avatar')
            .eq('id', (source as any).user_id)
            .single();
          if (u) author = u;
        }

        let moderatedBy: any = null;
        if (cm.moderated_by) {
          const { data: mod } = await this.admin
            .from('user_profiles')
            .select('id, username')
            .eq('id', cm.moderated_by)
            .single();
          moderatedBy = mod;
        }

        return {
          id: cm.id,
          type: cm.content_type,
          content_id: cm.content_id,
          author,
          preview: source ? String((source as any)[cfg.contentCol] ?? '').slice(0, 200) : null,
          moderation_status: cm.moderation_status,
          moderation_reason: cm.moderation_reason,
          reports_count: cm.reports_count ?? 0,
          created_at: (source as any)?.created_at ?? cm.created_at,
          moderated_at: cm.moderated_at,
          moderated_by: moderatedBy,
        };
      }),
    );

    // Summary counts
    const { data: sumData } = await this.admin
      .from('content_moderation')
      .select('moderation_status, reports_count');

    const summary = { visible: 0, hidden: 0, removed: 0, flagged: 0 };
    for (const row of sumData ?? []) {
      const s = row.moderation_status as keyof typeof summary;
      if (s in summary) summary[s]++;
      if (row.reports_count > 0) summary.flagged++;
    }

    return {
      success: true,
      data: { summary, items: items.filter(Boolean) },
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }

  async hideContent(adminId: string, adminUsername: string, contentType: string, contentId: string, reason: string, ip?: string) {
    if (!CONTENT_CONFIG[contentType]) throw new BadRequestException(`Invalid content type: ${contentType}`);
    await this.upsertModeration(adminId, contentType, contentId, 'hidden', reason);
    await this.updateSourceHidden(contentType, contentId, true, adminId);
    await this.adminUsers.logAction(adminId, adminUsername, 'hide_content', contentType, contentId, reason, {}, ip);
    return { success: true, data: null };
  }

  async restoreContent(adminId: string, adminUsername: string, cmId: string, reason: string, ip?: string) {
    const { data: cm, error } = await this.admin
      .from('content_moderation')
      .select('content_type, content_id')
      .eq('id', cmId)
      .single();

    if (error || !cm) throw new NotFoundException('Content record not found');

    await this.admin.from('content_moderation').update({
      moderation_status: 'visible',
      moderation_reason: reason || null,
      moderated_by: adminId,
      moderated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', cmId);

    await this.updateSourceHidden(cm.content_type, cm.content_id, false, adminId);
    await this.adminUsers.logAction(adminId, adminUsername, 'restore_content', cm.content_type, cm.content_id, reason, {}, ip);
    return { success: true, data: null };
  }

  async deleteContent(adminId: string, adminUsername: string, cmId: string, reason: string, ip?: string) {
    const { data: cm, error } = await this.admin
      .from('content_moderation')
      .select('content_type, content_id')
      .eq('id', cmId)
      .single();

    if (error || !cm) throw new NotFoundException('Content record not found');

    await this.admin.from('content_moderation').update({
      moderation_status: 'removed',
      moderation_reason: reason,
      moderated_by: adminId,
      moderated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', cmId);

    // Soft-delete from source table
    const cfg = CONTENT_CONFIG[cm.content_type];
    if (cfg) {
      await this.admin.from(cfg.table)
        .update({ is_hidden: true, hidden_by: adminId, hidden_at: new Date().toISOString() })
        .eq('id', cm.content_id);
    }

    await this.adminUsers.logAction(adminId, adminUsername, 'remove_content', cm.content_type, cm.content_id, reason, {}, ip);
    return null; // 204
  }

  async pinTopic(adminId: string, adminUsername: string, topicId: string, isPinned: boolean, ip?: string) {
    const { error } = await this.admin.from('forum_topics').update({ is_pinned: isPinned }).eq('id', topicId);
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, isPinned ? 'pin_topic' : 'unpin_topic', 'forum_topic', topicId, undefined, {}, ip);
    return { success: true, data: { id: topicId, is_pinned: isPinned } };
  }

  async lockTopic(adminId: string, adminUsername: string, topicId: string, isLocked: boolean, ip?: string) {
    const { error } = await this.admin.from('forum_topics').update({ is_locked: isLocked }).eq('id', topicId);
    if (error) throw new BadRequestException(error.message);
    await this.adminUsers.logAction(adminId, adminUsername, isLocked ? 'lock_topic' : 'unlock_topic', 'forum_topic', topicId, undefined, {}, ip);
    return { success: true, data: { id: topicId, is_locked: isLocked } };
  }

  private async upsertModeration(
    adminId: string, contentType: string, contentId: string,
    status: string, reason: string,
  ) {
    const now = new Date().toISOString();
    const { error } = await this.admin.from('content_moderation').upsert({
      content_type: contentType,
      content_id: contentId,
      moderation_status: status,
      moderation_reason: reason,
      moderated_by: adminId,
      moderated_at: now,
      updated_at: now,
    }, { onConflict: 'content_type,content_id' });
    if (error) throw new BadRequestException(error.message);
  }

  private async updateSourceHidden(contentType: string, contentId: string, isHidden: boolean, adminId: string) {
    const cfg = CONTENT_CONFIG[contentType];
    if (!cfg) return;
    const update: Record<string, any> = { is_hidden: isHidden };
    if (isHidden) { update.hidden_by = adminId; update.hidden_at = new Date().toISOString(); }
    else { update.hidden_by = null; update.hidden_at = null; }
    await this.admin.from(cfg.table).update(update).eq('id', contentId);
  }
}
