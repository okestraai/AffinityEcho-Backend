import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../database/supabase.client';
import logger from '../common/utils/logger.util';

/**
 * Daily sweep job that hard-deletes content soft-deleted more than 6 months ago.
 * Runs at 3:00 AM UTC. Order: children first to avoid FK violations.
 */
@Injectable()
export class DeleteSweepJobs {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  @Cron('0 0 3 * * *') // daily at 3 AM UTC
  async sweepDeletedContent() {
    logger.info('Starting delete sweep job', { module: 'DeleteSweep' });

    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.toISOString();

      let totalDeleted = 0;

      // 1. Delete comment_reactions for forum_comments being swept
      const { data: forumCommentIds } = await this.admin
        .from('forum_comments')
        .select('id')
        .eq('is_deleted', true)
        .lt('deleted_at', cutoff);

      if (forumCommentIds && forumCommentIds.length > 0) {
        const ids = forumCommentIds.map((c: any) => c.id);
        await this.admin
          .from('comment_reactions')
          .delete()
          .in('comment_id', ids);
      }

      // 2. Delete feed_reactions for feed_comments being swept
      const { data: feedCommentIds } = await this.admin
        .from('feed_comments')
        .select('id')
        .eq('is_deleted', true)
        .lt('deleted_at', cutoff);

      if (feedCommentIds && feedCommentIds.length > 0) {
        const ids = feedCommentIds.map((c: any) => c.id);
        await this.admin.from('feed_reactions').delete().in('content_id', ids);
      }

      // 3. Hard-delete feed_comments
      if (feedCommentIds && feedCommentIds.length > 0) {
        const { error } = await this.admin
          .from('feed_comments')
          .delete()
          .eq('is_deleted', true)
          .lt('deleted_at', cutoff);
        if (!error) totalDeleted += feedCommentIds.length;
      }

      // 4. Hard-delete forum_comments
      if (forumCommentIds && forumCommentIds.length > 0) {
        const { error } = await this.admin
          .from('forum_comments')
          .delete()
          .eq('is_deleted', true)
          .lt('deleted_at', cutoff);
        if (!error) totalDeleted += forumCommentIds.length;
      }

      // 5. Hard-delete nook_messages
      const { data: nookMsgIds } = await this.admin
        .from('nook_messages')
        .select('id')
        .eq('is_deleted', true)
        .lt('deleted_at', cutoff);

      if (nookMsgIds && nookMsgIds.length > 0) {
        await this.admin
          .from('nook_messages')
          .delete()
          .eq('is_deleted', true)
          .lt('deleted_at', cutoff);
        totalDeleted += nookMsgIds.length;
      }

      // 6. Hard-delete feed_posts (archived > 6 months)
      const { data: archivedPosts } = await this.admin
        .from('feed_posts')
        .select('id')
        .eq('is_archived', true)
        .lt('updated_at', cutoff);

      if (archivedPosts && archivedPosts.length > 0) {
        // Clean up remaining engagement data first
        const postIds = archivedPosts.map((p: any) => p.id);
        await this.admin
          .from('feed_reactions')
          .delete()
          .in('content_id', postIds);
        await this.admin.from('feed_likes').delete().in('content_id', postIds);
        await this.admin
          .from('feed_bookmarks')
          .delete()
          .in('content_id', postIds);
        await this.admin.from('feed_shares').delete().in('content_id', postIds);
        await this.admin
          .from('feed_posts')
          .delete()
          .eq('is_archived', true)
          .lt('updated_at', cutoff);
        totalDeleted += archivedPosts.length;
      }

      // 7. Hard-delete forum_topics
      const { data: deletedTopics } = await this.admin
        .from('forum_topics')
        .select('id')
        .eq('is_deleted', true)
        .lt('deleted_at', cutoff);

      if (deletedTopics && deletedTopics.length > 0) {
        const topicIds = deletedTopics.map((t: any) => t.id);
        await this.admin
          .from('topic_reactions')
          .delete()
          .in('topic_id', topicIds);
        await this.admin
          .from('topic_bookmarks')
          .delete()
          .in('topic_id', topicIds);
        await this.admin
          .from('forum_topics')
          .delete()
          .eq('is_deleted', true)
          .lt('deleted_at', cutoff);
        totalDeleted += deletedTopics.length;
      }

      // 8. Hard-delete nooks (deleted_at > 6 months — existing column used by admin + user delete)
      const { data: deletedNooks } = await this.admin
        .from('nooks')
        .select('id')
        .not('deleted_at', 'is', null)
        .lt('deleted_at', cutoff);

      if (deletedNooks && deletedNooks.length > 0) {
        const nookIds = deletedNooks.map((n: any) => n.id);
        await this.admin.from('nook_reactions').delete().in('nook_id', nookIds);
        await this.admin.from('nook_members').delete().in('nook_id', nookIds);
        await this.admin
          .from('nooks')
          .delete()
          .not('deleted_at', 'is', null)
          .lt('deleted_at', cutoff);
        totalDeleted += deletedNooks.length;
      }

      logger.info('Delete sweep completed', {
        module: 'DeleteSweep',
        totalDeleted,
      });
    } catch (error) {
      logger.error('Delete sweep failed', { module: 'DeleteSweep', error });
    }
  }
}
