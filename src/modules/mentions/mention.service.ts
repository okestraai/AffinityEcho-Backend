import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../database/supabase.client';
import { NotificationsService } from '../notifications/notifications.service';
import logger from '../../common/utils/logger.util';

@Injectable()
export class MentionService {
  private admin;

  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => NotificationsService))
    private notifications: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Parse @mentions from content text. Returns deduplicated usernames (without @).
   */
  parseMentions(content: string): string[] {
    const regex = /@(\w+)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      matches.push(match[1]);
    }

    return [...new Set(matches)];
  }

  /**
   * Process mentions: resolve usernames, upsert into mentions table, send notifications.
   * Failures here never break the caller — everything is wrapped in try/catch.
   */
  async processMentions(
    mentionerId: string,
    usernames: string[],
    contentType: string,
    contentId: string,
    contextId?: string,
  ): Promise<void> {
    if (usernames.length === 0) return;

    try {
      // Resolve usernames to user IDs
      const { data: users, error: usersError } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .in('username', usernames)
        .eq('is_deleted', false)
        .eq('is_deactivated', false);

      if (usersError || !users || users.length === 0) return;

      // Filter out self-mentions
      const validUsers = users.filter((u: any) => u.id !== mentionerId);
      if (validUsers.length === 0) return;

      // Filter out blocked users (bidirectional)
      const validUserIds = validUsers.map((u: any) => u.id);
      const { data: blocks } = await this.admin
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(
          `and(blocker_id.eq.${mentionerId},blocked_id.in.(${validUserIds.join(',')})),` +
            `and(blocked_id.eq.${mentionerId},blocker_id.in.(${validUserIds.join(',')}))`,
        );

      const blockedIds = new Set<string>();
      (blocks || []).forEach((b: any) => {
        blockedIds.add(
          b.blocker_id === mentionerId ? b.blocked_id : b.blocker_id,
        );
      });

      const mentionableUsers = validUsers.filter(
        (u: any) => !blockedIds.has(u.id),
      );
      if (mentionableUsers.length === 0) return;

      // Upsert mentions
      const mentionRows = mentionableUsers.map((u: any) => ({
        mentioner_id: mentionerId,
        mentioned_user_id: u.id,
        content_type: contentType,
        content_id: contentId,
        context_id: contextId || null,
      }));

      await this.admin.from('mentions').upsert(mentionRows, {
        onConflict: 'mentioner_id,mentioned_user_id,content_type,content_id',
      });

      // Get mentioner username for notification message
      const { data: mentioner } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', mentionerId)
        .single();

      // Create notifications for each mentioned user
      const actionUrl = this.buildActionUrl(contentType, contentId, contextId);

      for (const user of mentionableUsers) {
        try {
          await this.notifications.createNotification({
            user_id: user.id,
            actor_id: mentionerId,
            type: 'mention',
            title: 'You were mentioned',
            message: `${mentioner?.username || 'Someone'} mentioned you`,
            action_url: actionUrl,
            reference_id: contentId,
            reference_type: contentType,
            metadata: {
              content_type: contentType,
              content_id: contentId,
              context_id: contextId,
            },
          });
        } catch (notifErr) {
          logger.warn('Failed to send mention notification', {
            mentionedUserId: user.id,
            notifErr,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process mentions', {
        error,
        mentionerId,
        contentType,
        contentId,
      });
      // Never throw — mention failures must not break content creation
    }
  }

  private buildActionUrl(
    contentType: string,
    contentId: string,
    contextId?: string,
  ): string {
    switch (contentType) {
      case 'post':
        return `/feed/posts/${contentId}`;
      case 'comment':
        return contextId
          ? `/forum/topics/${contextId}#comment-${contentId}`
          : `/forum/comments/${contentId}`;
      case 'nook_message':
        return contextId
          ? `/nooks/${contextId}`
          : `/nooks/messages/${contentId}`;
      default:
        return `/content/${contentType}/${contentId}`;
    }
  }
}
