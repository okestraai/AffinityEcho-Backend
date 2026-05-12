import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EmailService } from '../../../common/utils/email/email.service';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class ModerationReviewService {
  private admin;

  constructor(
    private config: ConfigService,
    private emailService: EmailService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ─── REVIEW QUEUE ──────────────────────────────────────────────

  async getQueue(filters: {
    status?: string;
    priority?: string;
    contentType?: string;
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
      query = query.in('status', ['pending', 'claimed']);
    }

    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters.contentType) {
      query = query.eq('content_type', filters.contentType);
    }

    // Sort by priority order: urgent > high > normal > low
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw new BadRequestException(error.message);

    // Sort by priority weight in memory
    const priorityWeight: Record<string, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    const sorted = (data || []).sort(
      (a: any, b: any) =>
        (priorityWeight[a.priority] ?? 4) -
        (priorityWeight[b.priority] ?? 4),
    );

    // Enrich claimed_by / resolved_by with admin usernames
    const adminIds = [
      ...new Set(
        sorted
          .map((item: any) => [item.claimed_by, item.resolved_by])
          .flat()
          .filter(Boolean),
      ),
    ];

    let adminMap = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: admins } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('id', adminIds);

      adminMap = new Map(
        (admins || []).map((a: any) => [a.id, a.username]),
      );
    }

    const enriched = sorted.map((item: any) => ({
      ...item,
      claimed_by_username: item.claimed_by
        ? adminMap.get(item.claimed_by) || null
        : null,
      resolved_by_username: item.resolved_by
        ? adminMap.get(item.resolved_by) || null
        : null,
    }));

    return {
      success: true,
      data: enriched,
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: count ? offset + limit < count : false,
      },
    };
  }

  async claimItem(itemId: string, adminId: string) {
    const { data: item, error: fetchErr } = await this.admin
      .from('moderation_review_queue')
      .select('id, status, claimed_by')
      .eq('id', itemId)
      .single();

    if (fetchErr || !item) {
      throw new NotFoundException('Review queue item not found');
    }

    if (item.status === 'claimed' && item.claimed_by !== adminId) {
      throw new BadRequestException(
        'Item already claimed by another moderator',
      );
    }

    const { error } = await this.admin
      .from('moderation_review_queue')
      .update({ status: 'claimed', claimed_by: adminId })
      .eq('id', itemId);

    if (error) throw new BadRequestException(error.message);

    return { success: true, message: 'Item claimed' };
  }

  async resolveItem(
    itemId: string,
    adminId: string,
    resolution: 'confirm' | 'reverse' | 'modify',
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

    const now = new Date().toISOString();

    // Resolve the queue item
    await this.admin
      .from('moderation_review_queue')
      .update({
        status: 'resolved',
        resolved_by: adminId,
        resolution,
        resolution_reason: reason || null,
        resolved_at: now,
      })
      .eq('id', itemId);

    // Update content_moderation with human decision
    const humanBy = `human:${adminId}`;
    await this.admin
      .from('content_moderation')
      .update({
        moderated_by: humanBy,
        moderated_at: now,
        moderation_reason: reason || item.ai_verdict?.rationale,
        updated_at: now,
      })
      .eq('content_type', item.content_type)
      .eq('content_id', item.content_id);

    // If reversing — undo the AI's action
    if (resolution === 'reverse') {
      await this.reverseAction(item, adminId, reason);

      // Log disagreement for prompt tuning
      await this.admin.from('moderation_disagreements').insert({
        id: randomUUID(),
        content_type: item.content_type,
        content_id: item.content_id,
        ai_verdict: item.ai_verdict,
        human_resolution: resolution,
        human_reason: reason || null,
        resolved_by: adminId,
      });
    }

    const messages: Record<string, string> = {
      confirm: 'Item confirmed',
      reverse: 'Item reversed',
      modify: 'Item modified',
    };
    return { success: true, message: messages[resolution] || `Item ${resolution}` };
  }

  private async reverseAction(
    item: any,
    adminId: string,
    reason?: string,
  ) {
    const { content_type, content_id, current_state } = item;

    if (current_state === 'hidden') {
      // AI hid it — restore it
      await this.restoreContent(content_type, content_id);

      // Update moderation status
      await this.admin
        .from('content_moderation')
        .update({
          moderation_status: 'visible',
          moderated_by: `human:${adminId}`,
          moderation_reason:
            reason || 'Reversed by human reviewer',
          moderated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('content_type', content_type)
        .eq('content_id', content_id);

      // Send content-restored email to author
      await this.sendRestoredNotification(content_type, content_id);
    } else if (current_state === 'visible') {
      // AI allowed it but human disagrees — hide it
      await this.hideContent(content_type, content_id, adminId, reason);

      await this.admin
        .from('content_moderation')
        .update({
          moderation_status: 'hidden',
          moderated_by: `human:${adminId}`,
          moderation_reason: reason || 'Hidden by human reviewer',
          moderated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('content_type', content_type)
        .eq('content_id', content_id);
    }
  }

  private async restoreContent(
    contentType: string,
    contentId: string,
  ) {
    const tableMap: Record<string, string> = {
      feed_post: 'feed_posts',
      feed_comment: 'feed_comments',
      forum_topic: 'forum_topics',
      forum_comment: 'forum_comments',
      nook: 'nooks',
      nook_message: 'nook_messages',
      referral_post: 'referral_posts',
      referral_comment: 'referral_comments',
    };

    const table = tableMap[contentType];
    if (!table) return;

    await this.admin
      .from(table)
      .update({
        is_hidden: false,
        hidden_by: null,
        hidden_at: null,
        hidden_reason: null,
      })
      .eq('id', contentId);
  }

  private async hideContent(
    contentType: string,
    contentId: string,
    adminId: string,
    reason?: string,
  ) {
    const tableMap: Record<string, string> = {
      feed_post: 'feed_posts',
      feed_comment: 'feed_comments',
      forum_topic: 'forum_topics',
      forum_comment: 'forum_comments',
      nook: 'nooks',
      nook_message: 'nook_messages',
      referral_post: 'referral_posts',
      referral_comment: 'referral_comments',
    };

    const table = tableMap[contentType];
    if (!table) return;

    await this.admin
      .from(table)
      .update({
        is_hidden: true,
        hidden_by: adminId,
        hidden_at: new Date().toISOString(),
        hidden_reason: reason || 'Hidden by moderator',
      })
      .eq('id', contentId);
  }

  private async sendRestoredNotification(
    contentType: string,
    contentId: string,
  ) {
    try {
      const tableMap: Record<string, { table: string; authorCol: string }> = {
        feed_post: { table: 'feed_posts', authorCol: 'user_id' },
        feed_comment: { table: 'feed_comments', authorCol: 'user_id' },
        forum_topic: { table: 'forum_topics', authorCol: 'user_id' },
        forum_comment: { table: 'forum_comments', authorCol: 'user_id' },
        nook: { table: 'nooks', authorCol: 'creator_id' },
        nook_message: { table: 'nook_messages', authorCol: 'user_id' },
        referral_post: { table: 'referral_posts', authorCol: 'user_id' },
        referral_comment: { table: 'referral_comments', authorCol: 'user_id' },
      };

      const info = tableMap[contentType];
      if (!info) return;

      const { data: content } = await this.admin
        .from(info.table)
        .select(info.authorCol)
        .eq('id', contentId)
        .single();

      if (!content) return;

      const authorId = content[info.authorCol];
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('email, username')
        .eq('id', authorId)
        .single();

      if (profile?.email) {
        const humanType = this.humanContentType(contentType);
        await this.emailService.sendContentRestoredEmail(
          profile.email,
          profile.username,
          humanType,
        );
      }
    } catch (err) {
      logger.warn('Failed to send restored notification', { contentType, contentId, error: err });
    }
  }

  private humanContentType(contentType: string): string {
    const map: Record<string, string> = {
      feed_post: 'post',
      feed_comment: 'comment',
      forum_topic: 'topic',
      forum_comment: 'comment',
      nook: 'nook',
      nook_message: 'message',
      referral_post: 'referral post',
      referral_comment: 'comment',
    };
    return map[contentType] || 'content';
  }

  // ─── QUEUE STATS ──────────────────────────────────────────────

  async getStats() {
    const [pendingResult, claimedResult, resolvedResult, disagreementsResult] =
      await Promise.all([
        this.admin
          .from('moderation_review_queue')
          .select('priority', { count: 'exact', head: true })
          .eq('status', 'pending'),
        this.admin
          .from('moderation_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'claimed'),
        this.admin
          .from('moderation_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'resolved'),
        this.admin
          .from('moderation_disagreements')
          .select('id', { count: 'exact', head: true }),
      ]);

    // Get priority breakdown for pending items
    const { data: pendingByPriority } = await this.admin
      .from('moderation_review_queue')
      .select('priority')
      .eq('status', 'pending');

    const priorityCounts: Record<string, number> = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0,
    };
    (pendingByPriority || []).forEach((item: any) => {
      if (priorityCounts[item.priority] !== undefined) {
        priorityCounts[item.priority]++;
      }
    });

    // Get verdict distribution from content_moderation
    const { data: aiDecisions } = await this.admin
      .from('content_moderation')
      .select('moderation_status, ai_confidence')
      .like('moderated_by', 'ai:%');

    const verdictDist: Record<string, number> = {};
    (aiDecisions || []).forEach((d: any) => {
      verdictDist[d.moderation_status] =
        (verdictDist[d.moderation_status] || 0) + 1;
    });

    const totalResolved = resolvedResult.count || 0;
    const totalDisagreements = disagreementsResult.count || 0;
    const reversalRate =
      totalResolved > 0
        ? ((totalDisagreements / totalResolved) * 100).toFixed(1)
        : '0.0';

    return {
      success: true,
      data: {
        queue: {
          pending: pendingResult.count || 0,
          claimed: claimedResult.count || 0,
          resolved: totalResolved,
          byPriority: priorityCounts,
        },
        aiPerformance: {
          totalDecisions: (aiDecisions || []).length,
          verdictDistribution: verdictDist,
          reversalRate: `${reversalRate}%`,
          totalDisagreements,
        },
      },
    };
  }

  // ─── AI AUDIT TRAIL ──────────────────────────────────────────

  async getAuditLog(filters: {
    page?: number;
    limit?: number;
    verdict?: string;
    severity?: string;
    contentType?: string;
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

    if (filters.contentType) {
      query = query.eq('content_type', filters.contentType);
    }

    const { data, error, count } = await query;

    if (error) throw new BadRequestException(error.message);

    return {
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: count ? offset + limit < count : false,
      },
    };
  }

  async getItemAudit(contentType: string, contentId: string) {
    // Get all moderation actions for this content (AI + human)
    const { data: moderationHistory } = await this.admin
      .from('content_moderation')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    // Get review queue history
    const { data: reviewHistory } = await this.admin
      .from('moderation_review_queue')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    // Get disagreements
    const { data: disagreements } = await this.admin
      .from('moderation_disagreements')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    return {
      success: true,
      data: {
        moderation: moderationHistory || [],
        reviews: reviewHistory || [],
        disagreements: disagreements || [],
      },
    };
  }

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

    if (filters.contentType) {
      query = query.eq('content_type', filters.contentType);
    }

    const { data, error, count } = await query;

    if (error) throw new BadRequestException(error.message);

    return {
      success: true,
      data: data || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        hasMore: count ? offset + limit < count : false,
      },
    };
  }
}
