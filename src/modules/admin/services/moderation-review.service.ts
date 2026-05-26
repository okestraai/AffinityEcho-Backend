import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EmailService } from '../../../common/utils/email/email.service';
import { RedisService } from '../../../common/services/redis.service';
import logger from '../../../common/utils/logger.util';

const TABLE_MAP: Record<string, { table: string; authorCol: string; contentCol: string; titleCol?: string }> = {
  feed_post: { table: 'feed_posts', authorCol: 'user_id', contentCol: 'content' },
  feed_comment: { table: 'feed_comments', authorCol: 'user_id', contentCol: 'content' },
  forum_topic: { table: 'forum_topics', authorCol: 'user_id', contentCol: 'content', titleCol: 'title' },
  forum_comment: { table: 'forum_comments', authorCol: 'user_id', contentCol: 'content' },
  nook: { table: 'nooks', authorCol: 'creator_id', contentCol: 'description', titleCol: 'title' },
  nook_message: { table: 'nook_messages', authorCol: 'user_id', contentCol: 'content' },
  referral_post: { table: 'referral_posts', authorCol: 'user_id', contentCol: 'description_encrypted', titleCol: 'title_encrypted' },
  referral_comment: { table: 'referral_comments', authorCol: 'user_id', contentCol: 'content' },
};

const HUMAN_TYPE: Record<string, string> = {
  feed_post: 'post',
  feed_comment: 'comment',
  forum_topic: 'topic',
  forum_comment: 'comment',
  nook: 'nook',
  nook_message: 'message',
  referral_post: 'referral post',
  referral_comment: 'comment',
};

@Injectable()
export class ModerationReviewService {
  private admin;

  constructor(
    private config: ConfigService,
    private emailService: EmailService,
    private redis: RedisService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ─── CONTENT ENRICHMENT ─────────────────────────────────────

  private async enrichItems(items: any[]): Promise<any[]> {
    if (!items.length) return [];

    // Collect unique content lookups and author IDs
    const lookups = items.map((item: any) => ({
      contentType: item.content_type,
      contentId: item.content_id,
    }));

    // Batch-fetch content previews + authors
    const enriched = await Promise.all(
      lookups.map(async ({ contentType, contentId }) => {
        const info = TABLE_MAP[contentType];
        if (!info) return { preview: null, title: null, authorId: null };

        const selectCols = [info.contentCol, info.authorCol];
        if (info.titleCol) selectCols.push(info.titleCol);

        const { data } = await this.admin
          .from(info.table)
          .select(selectCols.join(', '))
          .eq('id', contentId)
          .single();

        if (!data) return { preview: null, title: null, authorId: null };

        const rawContent = data[info.contentCol] || '';
        const preview = typeof rawContent === 'string' ? rawContent.substring(0, 100) : '';
        const title = info.titleCol ? data[info.titleCol] || null : null;
        const authorId = data[info.authorCol];

        return { preview, title, authorId };
      }),
    );

    // Collect unique author IDs for username lookup
    const authorIds = [...new Set(enriched.map(e => e.authorId).filter(Boolean))];
    let authorMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: profiles } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', authorIds);
      authorMap = new Map((profiles || []).map((p: any) => [p.id, p.username]));
    }

    return items.map((item: any, i: number) => {
      const { preview, title, authorId } = enriched[i];
      return {
        ...item,
        content_preview: preview,
        content_title: title,
        author: authorId
          ? { id: authorId, username: authorMap.get(authorId) || null }
          : null,
      };
    });
  }

  // ─── REVIEW QUEUE ──────────────────────────────────────────────

  async getQueue(filters: {
    status?: string;
    priority?: string;
    contentType?: string;
    currentState?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.admin
      .from('moderation_review_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: true });

    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      query = query.eq('status', 'pending');
    }

    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.contentType) query = query.eq('content_type', filters.contentType);
    if (filters.currentState) query = query.eq('current_state', filters.currentState);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new BadRequestException(error.message);

    // Sort by priority weight
    const priorityWeight: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const sorted = (data || []).sort(
      (a: any, b: any) => (priorityWeight[a.priority] ?? 4) - (priorityWeight[b.priority] ?? 4),
    );

    // Enrich with content preview, title, author
    const enriched = await this.enrichItems(sorted);

    // Add available_actions + extract author_signals from ai_payload
    const withActions = enriched.map((item: any) => ({
      ...item,
      available_actions: item.current_state === 'hidden'
        ? ['reverse']
        : ['confirm', 'hide'],
      author_signals: item.ai_payload?.authorSignals || null,
      parent_context: (item.ai_payload?.parentChain || []).map((p: any) => ({
        type: p.type,
        content: (p.content || '').substring(0, 150),
        title: p.title || null,
      })),
      container: item.ai_payload?.container || null,
    }));

    // Enrich resolved_by with username
    const resolvedByIds = [...new Set(withActions.map((i: any) => i.resolved_by).filter(Boolean))];
    let resolvedMap = new Map<string, string>();
    if (resolvedByIds.length > 0) {
      const { data: admins } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', resolvedByIds);
      resolvedMap = new Map((admins || []).map((a: any) => [a.id, a.username]));
    }

    const final = withActions.map((item: any) => ({
      ...item,
      resolved_by_username: item.resolved_by ? resolvedMap.get(item.resolved_by) || null : null,
    }));

    return {
      success: true,
      data: final,
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: count ? offset + limit < count : false,
      },
    };
  }

  // ─── RESOLVE (reverse / confirm / hide) ────────────────────────

  async resolveItem(
    itemId: string,
    adminId: string,
    action: 'reverse' | 'confirm' | 'hide',
    reason?: string,
  ) {
    const { data: item, error: fetchErr } = await this.admin
      .from('moderation_review_queue')
      .select('*')
      .eq('id', itemId)
      .single();

    if (fetchErr || !item) {
      throw new NotFoundException('Review queue item not found');
    }

    // Validate action vs current_state
    if (action === 'reverse' && item.current_state !== 'hidden') {
      throw new BadRequestException('Cannot reverse — content is not hidden');
    }
    if (action === 'confirm' && item.current_state !== 'visible') {
      throw new BadRequestException('Cannot confirm — content is not visible (escalated)');
    }
    if (action === 'hide' && item.current_state !== 'visible') {
      throw new BadRequestException('Cannot hide — content is already hidden');
    }

    const now = new Date().toISOString();
    const humanBy = `human:${adminId}`;

    // Resolve the queue item
    await this.admin
      .from('moderation_review_queue')
      .update({
        status: 'resolved',
        resolved_by: adminId,
        resolution: action,
        resolution_reason: reason || null,
        resolved_at: now,
      })
      .eq('id', itemId);

    let previousState = item.current_state;
    let newState = item.current_state;

    if (action === 'reverse') {
      // Unhide content
      await this.restoreContent(item.content_type, item.content_id);
      newState = 'visible';

      // Update audit row
      await this.admin
        .from('content_moderation')
        .update({
          moderation_status: 'visible',
          moderated_by: humanBy,
          moderation_reason: reason || 'Reversed by human reviewer',
          moderated_at: now,
          updated_at: now,
        })
        .eq('content_type', item.content_type)
        .eq('content_id', item.content_id);

      // Email author: content restored
      await this.sendRestoredNotification(item.content_type, item.content_id);

      // Log disagreement for prompt tuning
      await this.admin.from('moderation_disagreements').insert({
        id: randomUUID(),
        content_type: item.content_type,
        content_id: item.content_id,
        ai_verdict: item.ai_verdict,
        human_resolution: 'reverse',
        human_reason: reason || null,
        resolved_by: adminId,
      });

    } else if (action === 'hide') {
      // Admin hides escalated content
      await this.hideContent(item.content_type, item.content_id, adminId, reason);
      newState = 'hidden';

      // Update/insert audit row
      await this.admin
        .from('content_moderation')
        .update({
          moderation_status: 'hidden',
          moderated_by: humanBy,
          moderation_reason: reason || 'Hidden by moderator after review',
          moderated_at: now,
          updated_at: now,
        })
        .eq('content_type', item.content_type)
        .eq('content_id', item.content_id);

      // Email author: content hidden
      await this.sendHiddenNotification(item.content_type, item.content_id, reason);

    } else {
      // confirm — just close the review item, update audit
      await this.admin
        .from('content_moderation')
        .update({
          moderated_by: humanBy,
          moderation_reason: reason || 'Confirmed safe by human reviewer',
          moderated_at: now,
          updated_at: now,
        })
        .eq('content_type', item.content_type)
        .eq('content_id', item.content_id);
    }

    // Invalidate caches so changes appear immediately
    if (action === 'reverse' || action === 'hide') {
      await this.redis.delPattern('feeds:*');
      await this.redis.delPattern('topics:*');
      await this.redis.delPattern('nooks:*');
    }

    const messages: Record<string, string> = {
      reverse: 'Content restored successfully',
      confirm: 'Content confirmed as safe',
      hide: 'Content hidden successfully',
    };

    return {
      success: true,
      message: messages[action],
      data: {
        content_type: item.content_type,
        content_id: item.content_id,
        action,
        previous_state: previousState,
        new_state: newState,
      },
    };
  }

  // ─── CONTENT ACTIONS ───────────────────────────────────────────

  private async restoreContent(contentType: string, contentId: string) {
    const info = TABLE_MAP[contentType];
    if (!info) return;
    await this.admin
      .from(info.table)
      .update({ is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null })
      .eq('id', contentId);
  }

  private async hideContent(contentType: string, contentId: string, adminId: string, reason?: string) {
    const info = TABLE_MAP[contentType];
    if (!info) return;
    await this.admin
      .from(info.table)
      .update({
        is_hidden: true,
        hidden_by: adminId,
        hidden_at: new Date().toISOString(),
        hidden_reason: reason || 'Hidden by moderator',
      })
      .eq('id', contentId);
  }

  // ─── AUTHOR NOTIFICATIONS ──────────────────────────────────────

  private async getAuthorInfo(contentType: string, contentId: string) {
    const info = TABLE_MAP[contentType];
    if (!info) return null;

    const { data: content } = await this.admin
      .from(info.table)
      .select(info.authorCol)
      .eq('id', contentId)
      .single();
    if (!content) return null;

    const authorId = content[info.authorCol];
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('email, username')
      .eq('id', authorId)
      .single();

    return profile;
  }

  private async sendRestoredNotification(contentType: string, contentId: string) {
    try {
      const profile = await this.getAuthorInfo(contentType, contentId);
      if (profile?.email) {
        await this.emailService.sendContentRestoredEmail(
          profile.email,
          profile.username,
          HUMAN_TYPE[contentType] || 'content',
        );
      }
    } catch (err) {
      logger.warn('Failed to send restored notification', { contentType, contentId, error: err });
    }
  }

  private async sendHiddenNotification(contentType: string, contentId: string, reason?: string) {
    try {
      const profile = await this.getAuthorInfo(contentType, contentId);
      if (profile?.email) {
        await this.emailService.sendContentHiddenEmail(
          profile.email,
          profile.username,
          HUMAN_TYPE[contentType] || 'content',
          reason || 'This content was hidden after review by our moderation team.',
          contentId,
        );
      }
    } catch (err) {
      logger.warn('Failed to send hidden notification', { contentType, contentId, error: err });
    }
  }

  // ─── QUEUE STATS ──────────────────────────────────────────────

  async getReviewStats() {
    const [pendingResult, resolvedResult] = await Promise.all([
      this.admin
        .from('moderation_review_queue')
        .select('priority, current_state', { count: 'exact' })
        .eq('status', 'pending'),
      this.admin
        .from('moderation_review_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'resolved'),
    ]);

    const pending = pendingResult.data || [];
    const priorityCounts: Record<string, number> = { urgent: 0, high: 0, normal: 0, low: 0 };
    const stateCounts: Record<string, number> = { hidden: 0, visible: 0 };

    pending.forEach((item: any) => {
      if (priorityCounts[item.priority] !== undefined) priorityCounts[item.priority]++;
      if (stateCounts[item.current_state] !== undefined) stateCounts[item.current_state]++;
    });

    return {
      success: true,
      data: {
        queue: {
          pending: pendingResult.count || 0,
          resolved: resolvedResult.count || 0,
          byPriority: priorityCounts,
          byState: stateCounts,
        },
      },
    };
  }

  // ─── OVERALL AI STATS ─────────────────────────────────────────

  async getStats() {
    const [aiDecisionsResult, disagreementsResult, pendingResult, resolvedTodayResult] =
      await Promise.all([
        this.admin
          .from('content_moderation')
          .select('moderation_status, ai_confidence, content_type, raw_response')
          .like('moderated_by', 'ai:%'),
        this.admin
          .from('moderation_disagreements')
          .select('id', { count: 'exact', head: true }),
        this.admin
          .from('moderation_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        this.admin
          .from('moderation_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'resolved')
          .gte('resolved_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);

    const aiDecisions = aiDecisionsResult.data || [];
    const totalDecisions = aiDecisions.length;

    // Verdict distribution
    const verdictDist: Record<string, number> = {};
    aiDecisions.forEach((d: any) => {
      verdictDist[d.moderation_status] = (verdictDist[d.moderation_status] || 0) + 1;
    });

    // Average confidence
    const confidences = aiDecisions.map((d: any) => d.ai_confidence).filter((c: any) => c != null);
    const avgConfidence = confidences.length > 0
      ? parseFloat((confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length).toFixed(2))
      : 0;

    // Hidden by category
    const hiddenByCategory: Record<string, number> = {};
    aiDecisions
      .filter((d: any) => d.moderation_status === 'hidden')
      .forEach((d: any) => {
        const cats = d.raw_response?.categories || [];
        cats.forEach((cat: string) => {
          hiddenByCategory[cat] = (hiddenByCategory[cat] || 0) + 1;
        });
      });

    // Content type breakdown
    const contentTypeBreakdown: Record<string, number> = {};
    aiDecisions.forEach((d: any) => {
      contentTypeBreakdown[d.content_type] = (contentTypeBreakdown[d.content_type] || 0) + 1;
    });

    // Reversal rate
    const totalDisagreements = disagreementsResult.count || 0;
    const hiddenCount = verdictDist['hidden'] || 0;
    const reversalRate = hiddenCount > 0
      ? ((totalDisagreements / hiddenCount) * 100).toFixed(1)
      : '0.0';

    return {
      success: true,
      data: {
        totalDecisions,
        verdictDistribution: verdictDist,
        averageConfidence: avgConfidence,
        hiddenByCategory,
        reversals: {
          total: totalDisagreements,
          reversalRate: `${reversalRate}%`,
        },
        reviewQueue: {
          pending: pendingResult.count || 0,
          resolvedToday: resolvedTodayResult.count || 0,
        },
        contentTypeBreakdown,
      },
    };
  }

  // ─── AI AUDIT TRAIL ──────────────────────────────────────────

  async getAuditLog(filters: {
    page?: number;
    limit?: number;
    contentType?: string;
    status?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.admin
      .from('content_moderation')
      .select('*', { count: 'exact' })
      .like('moderated_by', 'ai:%')
      .order('moderated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.contentType) query = query.eq('content_type', filters.contentType);
    if (filters.status) query = query.eq('moderation_status', filters.status);

    const { data, error, count } = await query;
    if (error) throw new BadRequestException(error.message);

    // Check which items were reversed
    const items = data || [];
    const contentKeys = items.map((i: any) => `${i.content_type}:${i.content_id}`);

    let reversedSet = new Set<string>();
    if (contentKeys.length > 0) {
      const { data: disagreements } = await this.admin
        .from('moderation_disagreements')
        .select('content_type, content_id');
      (disagreements || []).forEach((d: any) => {
        reversedSet.add(`${d.content_type}:${d.content_id}`);
      });
    }

    // Enrich with content preview, title, author
    const enriched = await this.enrichItems(items);

    const withReversed = enriched.map((item: any) => ({
      ...item,
      was_reversed: reversedSet.has(`${item.content_type}:${item.content_id}`),
    }));

    return {
      success: true,
      data: withReversed,
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: count ? offset + limit < count : false,
      },
    };
  }

  async getItemAudit(contentType: string, contentId: string) {
    // Get content info
    const info = TABLE_MAP[contentType];
    let contentData: any = null;
    if (info) {
      const selectCols = [info.contentCol, info.authorCol, 'created_at'];
      if (info.titleCol) selectCols.push(info.titleCol);

      const { data } = await this.admin
        .from(info.table)
        .select(selectCols.join(', ') + ', is_hidden')
        .eq('id', contentId)
        .single();

      if (data) {
        const authorId = data[info.authorCol];
        const { data: profile } = await this.admin
          .from('user_profiles')
          .select('id, username')
          .eq('id', authorId)
          .single();

        contentData = {
          type: contentType,
          id: contentId,
          preview: (data[info.contentCol] || '').substring(0, 200),
          title: info.titleCol ? data[info.titleCol] || null : null,
          author: profile ? { id: profile.id, username: profile.username } : null,
          created_at: data.created_at,
          current_state: data.is_hidden ? 'hidden' : 'visible',
        };
      }
    }

    // Moderation history
    const { data: moderationHistory } = await this.admin
      .from('content_moderation')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .order('moderated_at', { ascending: true });

    // Enrich moderated_by usernames for human entries
    const humanIds = (moderationHistory || [])
      .filter((m: any) => m.moderated_by?.startsWith('human:'))
      .map((m: any) => m.moderated_by.replace('human:', ''));

    let humanMap = new Map<string, string>();
    if (humanIds.length > 0) {
      const { data: admins } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', humanIds);
      humanMap = new Map((admins || []).map((a: any) => [a.id, a.username]));
    }

    const history = (moderationHistory || []).map((m: any) => ({
      action: m.moderation_status,
      by: m.moderated_by,
      by_username: m.moderated_by?.startsWith('human:')
        ? humanMap.get(m.moderated_by.replace('human:', '')) || null
        : null,
      reason: m.moderation_reason,
      confidence: m.ai_confidence,
      at: m.moderated_at,
    }));

    // Review history
    const { data: reviewHistory } = await this.admin
      .from('moderation_review_queue')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    const resolvedByIds = (reviewHistory || []).map((r: any) => r.resolved_by).filter(Boolean);
    let resolvedMap = new Map<string, string>();
    if (resolvedByIds.length > 0) {
      const { data: admins } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', resolvedByIds);
      resolvedMap = new Map((admins || []).map((a: any) => [a.id, a.username]));
    }

    const reviews = (reviewHistory || []).map((r: any) => ({
      id: r.id,
      priority: r.priority,
      reason: r.reason,
      status: r.status,
      resolution: r.resolution,
      resolution_reason: r.resolution_reason,
      resolved_by_username: r.resolved_by ? resolvedMap.get(r.resolved_by) || null : null,
      resolved_at: r.resolved_at,
      created_at: r.created_at,
    }));

    // Disagreements
    const { data: disagreements } = await this.admin
      .from('moderation_disagreements')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    const disResolvedIds = (disagreements || []).map((d: any) => d.resolved_by).filter(Boolean);
    let disMap = new Map<string, string>();
    if (disResolvedIds.length > 0) {
      const { data: admins } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', disResolvedIds);
      disMap = new Map((admins || []).map((a: any) => [a.id, a.username]));
    }

    const disEnriched = (disagreements || []).map((d: any) => ({
      ai_said: d.ai_verdict?.verdict,
      ai_confidence: d.ai_verdict?.confidence,
      ai_categories: d.ai_verdict?.categories || [],
      human_said: d.human_resolution,
      human_reason: d.human_reason,
      reversed_by_username: d.resolved_by ? disMap.get(d.resolved_by) || null : null,
      created_at: d.created_at,
    }));

    return {
      success: true,
      data: {
        content: contentData,
        moderation_history: history,
        review_history: reviews,
        disagreements: disEnriched,
      },
    };
  }

  // ─── DISAGREEMENTS ─────────────────────────────────────────────

  async getDisagreements(filters: {
    page?: number;
    limit?: number;
    contentType?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.admin
      .from('moderation_disagreements')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.contentType) query = query.eq('content_type', filters.contentType);

    const { data, error, count } = await query;
    if (error) throw new BadRequestException(error.message);

    // Enrich with content preview + author + reversed_by username
    const items = data || [];
    const enriched = await this.enrichItems(items);

    const resolvedByIds = [...new Set(items.map((d: any) => d.resolved_by).filter(Boolean))];
    let resolvedMap = new Map<string, string>();
    if (resolvedByIds.length > 0) {
      const { data: admins } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', resolvedByIds);
      resolvedMap = new Map((admins || []).map((a: any) => [a.id, a.username]));
    }

    const final = enriched.map((item: any) => ({
      ...item,
      reversed_by: item.resolved_by
        ? { id: item.resolved_by, username: resolvedMap.get(item.resolved_by) || null }
        : null,
    }));

    return {
      success: true,
      data: final,
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: count ? offset + limit < count : false,
      },
    };
  }
}
