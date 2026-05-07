import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';
import { FlagContentDto } from './dto/flag-content.dto';

const logger = {
  info: (msg: string, meta?: any) =>
    console.log(
      JSON.stringify({
        level: 'info',
        message: msg,
        service: 'affinity-echo-api',
        timestamp: new Date().toISOString(),
        ...meta,
      }),
    ),
  error: (msg: string, meta?: any) =>
    console.log(
      JSON.stringify({
        level: 'error',
        message: msg,
        service: 'affinity-echo-api',
        timestamp: new Date().toISOString(),
        ...meta,
      }),
    ),
};

@Injectable()
export class ContentSafetyService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async flagContent(
    reporterId: string,
    contentType: string,
    contentId: string,
    dto: FlagContentDto,
  ) {
    logger.info('Flagging content', {
      reporterId,
      contentType,
      contentId,
      reason: dto.reason,
    });

    // Check for duplicate flag
    const { data: existing } = await this.admin
      .from('content_flags')
      .select('id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('reporter_id', reporterId)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('You have already reported this content');
    }

    // Insert flag
    const { data: flag, error } = await this.admin
      .from('content_flags')
      .insert({
        content_type: contentType,
        content_id: contentId,
        reporter_id: reporterId,
        reason: dto.reason,
        description: dto.description || null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to flag content', { error: error.message });
      throw new BadRequestException(
        'Unable to flag this content, please try again',
      );
    }

    // Check if content should be auto-hidden (3+ flags from different users)
    const { count } = await this.admin
      .from('content_flags')
      .select('id', { count: 'exact', head: true })
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    if (count && count >= 3) {
      await this.autoHideContent(contentType, contentId);
    }

    return {
      success: true,
      data: flag,
    };
  }

  async hideContent(userId: string, contentType: string, contentId: string) {
    logger.info('Hiding content', { userId, contentType, contentId });

    const { error } = await this.admin.from('user_hidden_content').upsert(
      {
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
      },
      { onConflict: 'user_id,content_type,content_id' },
    );

    if (error) {
      logger.error('Failed to hide content', { error: error.message });
      throw new BadRequestException(
        'Unable to hide this content, please try again',
      );
    }

    return {
      success: true,
      message: 'Content hidden',
    };
  }

  /**
   * Get hidden content IDs for a user, filtered by type.
   * Used by feed/topic/nook queries to exclude hidden content.
   */
  async getHiddenContentIds(
    userId: string,
    contentType: string,
  ): Promise<string[]> {
    const { data, error } = await this.admin
      .from('user_hidden_content')
      .select('content_id')
      .eq('user_id', userId)
      .eq('content_type', contentType);

    if (error) return [];

    return (data || []).map((r: any) => r.content_id);
  }

  /**
   * Get all blocked user IDs for a user (both directions).
   * Used by feed/topic/nook queries to exclude blocked users' content.
   */
  async getBlockedUserIds(userId: string): Promise<string[]> {
    const { data: blockedByMe } = await this.admin
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', userId);

    const { data: blockedMe } = await this.admin
      .from('user_blocks')
      .select('blocker_id')
      .eq('blocked_id', userId);

    const ids = new Set<string>();
    (blockedByMe || []).forEach((r: any) => ids.add(r.blocked_id));
    (blockedMe || []).forEach((r: any) => ids.add(r.blocker_id));
    return Array.from(ids);
  }

  private async autoHideContent(contentType: string, contentId: string) {
    const tableMap: Record<string, string> = {
      post: 'feed_posts',
      topic: 'forum_topics',
      comment: 'feed_comments',
      nook: 'nooks',
      nook_message: 'nook_messages',
    };

    const table = tableMap[contentType];
    if (!table) return;

    // Use is_hidden if the table has it, otherwise skip
    const { error } = await this.admin
      .from(table)
      .update({ is_hidden: true })
      .eq('id', contentId);

    if (!error) {
      logger.info('Auto-hidden content after 3+ flags', {
        contentType,
        contentId,
      });
    }
  }

  // ─── ADMIN METHODS ────────────────────────────────────────────────────────

  async getFlags(opts: {
    status?: string;
    contentType?: string;
    page: number;
    limit: number;
  }) {
    const { status, contentType, page, limit } = opts;
    const offset = (page - 1) * limit;

    let q = this.admin
      .from('content_flags')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) q = q.eq('status', status);
    if (contentType) q = q.eq('content_type', contentType);

    const { data, error, count } = await q;

    if (error) {
      logger.error('Failed to fetch flags', { error: error.message });
      throw new BadRequestException('Unable to load content flags');
    }

    // Batch fetch reporter and reviewer profiles
    const userIds = new Set<string>();
    (data || []).forEach((f: any) => {
      if (f.reporter_id) userIds.add(f.reporter_id);
      if (f.reviewed_by) userIds.add(f.reviewed_by);
    });

    const userMap: Record<string, any> = {};
    if (userIds.size > 0) {
      const { data: users } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar')
        .in('id', Array.from(userIds));

      (users || []).forEach((u: any) => {
        userMap[u.id] = u;
      });
    }

    const flags = (data || []).map((f: any) => ({
      ...f,
      reporter: userMap[f.reporter_id] || null,
      reviewer: userMap[f.reviewed_by] || null,
    }));

    return {
      success: true,
      data: flags,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async reviewFlag(flagId: string, status: string, adminId: string) {
    const validStatuses = ['reviewed', 'dismissed', 'actioned'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const { data, error } = await this.admin
      .from('content_flags')
      .update({
        status,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', flagId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to review flag', { error: error.message });
      throw new BadRequestException('Unable to update this flag');
    }

    logger.info('Flag reviewed', { flagId, status, adminId });

    return { success: true, data };
  }
}
