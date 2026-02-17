import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { CreateFeedCommentDto } from '../dto/create-comment.dto';
import { ShareFeedItemDto } from '../dto/share-feed-item.dto';
import { NotificationsService } from '../../notifications/notifications.service';

type ContentType = 'post' | 'topic' | 'nook_message';

@Injectable()
export class FeedEngagementService {
  private admin;

  constructor(
    private config: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ============ LIKES ============
  async toggleLike(contentType: ContentType, contentId: string, userId: string) {
    logger.info('Toggling like', { contentType, contentId, userId });

    try {
      // Check if already liked
      const { data: existing } = await this.admin
        .from('feed_likes')
        .select('id')
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .maybeSingle();

      if (existing) {
        // Unlike
        await this.admin.from('feed_likes').delete().eq('id', existing.id);
        await this.decrementLikeCount(contentType, contentId);

        return {
          success: true,
          data: { liked: false },
          message: 'Unliked successfully',
        };
      } else {
        // Like
        await this.admin.from('feed_likes').insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
        });

        await this.incrementLikeCount(contentType, contentId);

        // Create notification
        await this.createLikeNotification(contentType, contentId, userId);

        return {
          success: true,
          data: { liked: true },
          message: 'Liked successfully',
        };
      }
    } catch (error) {
      logger.error('Failed to toggle like', { error });
      throw new BadRequestException('Failed to toggle like');
    }
  }

  // ============ COMMENTS ============
  async addComment(
    contentType: ContentType,
    contentId: string,
    userId: string,
    dto: CreateFeedCommentDto,
  ) {
    logger.info('Adding comment', { contentType, contentId, userId });

    try {
      // Verify content exists
      await this.verifyContentExists(contentType, contentId);

      const { data: comment, error } = await this.admin
        .from('feed_comments')
        .insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          content: dto.content,
          is_anonymous: dto.isAnonymous || false,
          parent_comment_id: dto.parentCommentId || null,
        })
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar
          )
        `,
        )
        .single();

      if (error) {
        throw new BadRequestException('Failed to add comment');
      }

      // Increment comment count
      await this.incrementCommentCount(contentType, contentId);

      // Create notification
      await this.createCommentNotification(contentType, contentId, userId, dto.content);

      return {
        success: true,
        data: this.formatComment(comment),
        message: 'Comment added successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      logger.error('Failed to add comment', { error });
      throw new BadRequestException('Failed to add comment');
    }
  }

  async getComments(
    contentType: ContentType,
    contentId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    logger.info('Fetching comments', { contentType, contentId, page, limit });

    const offset = (page - 1) * limit;

    try {
      const { data: comments, error, count } = await this.admin
        .from('feed_comments')
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar
          )
        `,
          { count: 'exact' },
        )
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .is('parent_comment_id', null) // Top-level comments only
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException('Failed to fetch comments');
      }

      return {
        success: true,
        data: (comments || []).map((c) => this.formatComment(c)),
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to fetch comments', { error });
      throw new BadRequestException('Failed to fetch comments');
    }
  }

  // ============ SHARES ============
  async shareItem(contentType: ContentType, contentId: string, userId: string, dto: ShareFeedItemDto) {
    logger.info('Sharing item', { contentType, contentId, userId });

    try {
      // Check if already shared
      const { data: existing } = await this.admin
        .from('feed_shares')
        .select('id')
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .maybeSingle();

      if (existing) {
        throw new BadRequestException('Already shared this item');
      }

      await this.admin.from('feed_shares').insert({
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
        share_message: dto.shareMessage || null,
      });

      await this.incrementShareCount(contentType, contentId);

      return {
        success: true,
        message: 'Item shared successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to share item', { error });
      throw new BadRequestException('Failed to share item');
    }
  }

  async unshareItem(contentType: ContentType, contentId: string, userId: string) {
    logger.info('Unsharing item', { contentType, contentId, userId });

    try {
      const { error } = await this.admin
        .from('feed_shares')
        .delete()
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId);

      if (error) {
        throw new BadRequestException('Failed to unshare item');
      }

      await this.decrementShareCount(contentType, contentId);

      return {
        success: true,
        message: 'Item unshared successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to unshare item', { error });
      throw new BadRequestException('Failed to unshare item');
    }
  }

  // ============ BOOKMARKS ============
  async toggleBookmark(contentType: ContentType, contentId: string, userId: string) {
    logger.info('Toggling bookmark', { contentType, contentId, userId });

    try {
      const { data: existing } = await this.admin
        .from('feed_bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .maybeSingle();

      if (existing) {
        // Remove bookmark
        await this.admin.from('feed_bookmarks').delete().eq('id', existing.id);

        return {
          success: true,
          data: { bookmarked: false },
          message: 'Bookmark removed',
        };
      } else {
        // Add bookmark
        await this.admin.from('feed_bookmarks').insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
        });

        return {
          success: true,
          data: { bookmarked: true },
          message: 'Bookmarked successfully',
        };
      }
    } catch (error) {
      logger.error('Failed to toggle bookmark', { error });
      throw new BadRequestException('Failed to toggle bookmark');
    }
  }

  async getUserBookmarks(userId: string, page: number = 1, limit: number = 20) {
    logger.info('Fetching user bookmarks', { userId, page, limit });

    const offset = (page - 1) * limit;

    try {
      const { data: bookmarks, error, count } = await this.admin
        .from('feed_bookmarks')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException('Failed to fetch bookmarks');
      }

      return {
        success: true,
        data: bookmarks || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to fetch bookmarks', { error });
      throw new BadRequestException('Failed to fetch bookmarks');
    }
  }

  // ============ HELPER METHODS ============
  private async verifyContentExists(contentType: ContentType, contentId: string) {
    const tableMap = {
      post: 'feed_posts',
      topic: 'forum_topics',
      nook_message: 'nook_messages',
    };

    const { data, error } = await this.admin
      .from(tableMap[contentType])
      .select('id')
      .eq('id', contentId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Content not found');
    }
  }

  private async incrementLikeCount(contentType: ContentType, contentId: string) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('increment_feed_post_likes', {
        post_id: contentId,
      });

      if (error) {
        await this.admin
          .from('feed_posts')
          .update({ likes_count: () => 'likes_count + 1' })
          .eq('id', contentId);
      }
    }
    // For topics and nook_messages, use their own increment logic
  }

  private async decrementLikeCount(contentType: ContentType, contentId: string) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('decrement_feed_post_likes', {
        post_id: contentId,
      });

      if (error) {
        await this.admin
          .from('feed_posts')
          .update({ likes_count: () => 'GREATEST(0, likes_count - 1)' })
          .eq('id', contentId);
      }
    }
  }

  private async incrementCommentCount(contentType: ContentType, contentId: string) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('increment_feed_post_comments', {
        post_id: contentId,
      });

      if (error) {
        await this.admin
          .from('feed_posts')
          .update({ comments_count: () => 'comments_count + 1' })
          .eq('id', contentId);
      }
    }
  }

  private async incrementShareCount(contentType: ContentType, contentId: string) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('increment_feed_post_shares', {
        post_id: contentId,
      });

      if (error) {
        await this.admin
          .from('feed_posts')
          .update({ shares_count: () => 'shares_count + 1' })
          .eq('id', contentId);
      }
    }
  }

  private async decrementShareCount(contentType: ContentType, contentId: string) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('decrement_feed_post_shares', {
        post_id: contentId,
      });

      if (error) {
        await this.admin
          .from('feed_posts')
          .update({ shares_count: () => 'GREATEST(0, shares_count - 1)' })
          .eq('id', contentId);
      }
    }
  }

  private async createLikeNotification(contentType: ContentType, contentId: string, userId: string) {
    try {
      const contentOwnerId = await this.getContentOwnerId(contentType, contentId);
      if (!contentOwnerId || contentOwnerId === userId) return;

      const { data: liker } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', userId)
        .single();

      await this.notificationsService.createNotification({
        user_id: contentOwnerId,
        actor_id: userId,
        type: contentType === 'post' ? 'feed_like' : 'forum_like',
        title: 'New Like',
        message: `${liker?.username || 'Someone'} liked your ${contentType === 'post' ? 'post' : contentType}`,
        action_url: this.getContentUrl(contentType, contentId),
        reference_id: contentId,
        reference_type: contentType,
        metadata: {},
        delivery_method: ['in_app'],
      });
    } catch (error) {
      logger.error('Failed to create like notification', { error });
    }
  }

  private async createCommentNotification(
    contentType: ContentType,
    contentId: string,
    userId: string,
    content: string,
  ) {
    try {
      const contentOwnerId = await this.getContentOwnerId(contentType, contentId);
      if (!contentOwnerId || contentOwnerId === userId) return;

      const { data: commenter } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', userId)
        .single();

      await this.notificationsService.createNotification({
        user_id: contentOwnerId,
        actor_id: userId,
        type: 'forum_comment',
        title: 'New Comment',
        message: `${commenter?.username || 'Someone'} commented on your ${contentType === 'post' ? 'post' : contentType}`,
        action_url: this.getContentUrl(contentType, contentId),
        reference_id: contentId,
        reference_type: contentType,
        metadata: { comment_preview: content.substring(0, 100) },
        delivery_method: ['in_app'],
      });
    } catch (error) {
      logger.error('Failed to create comment notification', { error });
    }
  }

  private async getContentOwnerId(contentType: ContentType, contentId: string): Promise<string | null> {
    const tableMap = {
      post: 'feed_posts',
      topic: 'forum_topics',
      nook_message: 'nook_messages',
    };

    const { data } = await this.admin
      .from(tableMap[contentType])
      .select('user_id')
      .eq('id', contentId)
      .single();

    return data?.user_id || null;
  }

  private getContentUrl(contentType: ContentType, contentId: string): string {
    switch (contentType) {
      case 'post':
        return `/feed/posts/${contentId}`;
      case 'topic':
        return `/forum/topics/${contentId}`;
      case 'nook_message':
        return `/nooks/messages/${contentId}`;
      default:
        return '/feed';
    }
  }

  private formatComment(comment: any) {
    return {
      id: comment.id,
      user_id: comment.user_id,
      content: comment.content,
      is_anonymous: comment.is_anonymous,
      parent_comment_id: comment.parent_comment_id,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      author: {
        display_name: comment.is_anonymous
          ? 'Anonymous User'
          : comment.user_profile?.username || 'Unknown',
        avatar: comment.is_anonymous ? '👤' : comment.user_profile?.avatar || 'User',
      },
    };
  }
}
