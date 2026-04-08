import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { CreateFeedCommentDto } from '../dto/create-comment.dto';
import { ShareFeedItemDto } from '../dto/share-feed-item.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';

type ContentType = 'post' | 'topic' | 'nook_message';

@Injectable()
export class FeedEngagementService {
  private admin;

  constructor(
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private redis: RedisService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ============ LIKES ============
  async toggleLike(
    contentType: ContentType,
    contentId: string,
    userId: string,
  ) {
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

        await this.redis.delPattern('feeds:*');

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

        await this.redis.delPattern('feeds:*');

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

  // ============ REACTIONS (Heard, Validated, Inspired) ============
  async toggleReaction(
    contentType: ContentType,
    contentId: string,
    userId: string,
    reactionType: string,
  ) {
    logger.info('Toggling reaction', {
      contentType,
      contentId,
      userId,
      reactionType,
    });

    const validReactions = ['heard', 'validated', 'inspired'];
    if (!validReactions.includes(reactionType)) {
      throw new BadRequestException(
        `Invalid reaction type. Valid: ${validReactions.join(', ')}`,
      );
    }

    try {
      // Check if already reacted
      const { data: existing } = await this.admin
        .from('feed_reactions')
        .select('id')
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .eq('reaction_type', reactionType)
        .maybeSingle();

      if (existing) {
        // Remove reaction
        await this.admin.from('feed_reactions').delete().eq('id', existing.id);
        await this.redis.delPattern('feeds:*');

        const counts = await this.getReactionCounts(contentType, contentId);
        return {
          success: true,
          data: { reacted: false, reactionType, counts },
          message: 'Reaction removed',
        };
      } else {
        // Add reaction
        await this.admin.from('feed_reactions').insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          reaction_type: reactionType,
        });

        // Create notification for the content owner
        await this.createReactionNotification(
          contentType,
          contentId,
          userId,
          reactionType,
        );
        await this.redis.delPattern('feeds:*');

        const counts = await this.getReactionCounts(contentType, contentId);
        return {
          success: true,
          data: { reacted: true, reactionType, counts },
          message: 'Reaction added',
        };
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to toggle reaction', { error });
      throw new BadRequestException('Failed to toggle reaction');
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
            avatar,
            is_company_verified
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
      await this.createCommentNotification(
        contentType,
        contentId,
        userId,
        dto.content,
      );

      await this.redis.delPattern('feeds:*');

      return {
        success: true,
        data: this.formatComment(comment),
        message: 'Comment added successfully',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      logger.error('Failed to add comment', { error });
      throw new BadRequestException('Failed to add comment');
    }
  }

  async getComments(
    contentType: ContentType,
    contentId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    logger.info('Fetching comments', { contentType, contentId, page, limit });

    const offset = (page - 1) * limit;

    try {
      // Step 1: Get paginated top-level comments count for pagination
      const { count: topLevelCount } = await this.admin
        .from('feed_comments')
        .select('id', { count: 'exact', head: true })
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .is('parent_comment_id', null);

      // Step 2: Get paginated top-level comment IDs
      const { data: topLevelComments, error: topLevelError } = await this.admin
        .from('feed_comments')
        .select('id')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .is('parent_comment_id', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (topLevelError) {
        throw new BadRequestException('Failed to fetch comments');
      }

      const topLevelIds = (topLevelComments || []).map((c: any) => c.id);

      if (topLevelIds.length === 0) {
        return {
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: topLevelCount || 0,
            hasMore: false,
          },
        };
      }

      // Step 3: Fetch all comments for this content (top-level + all nested replies)
      const { data: allComments, error } = await this.admin
        .from('feed_comments')
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            first_name_encrypted,
            last_name_encrypted,
            is_company_verified
          )
        `,
        )
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new BadRequestException('Failed to fetch comments');
      }

      const comments = allComments || [];

      // Step 4: Apply identity reveal to all comment authors
      const authorIds = comments
        .map((c: any) => c.user_id)
        .filter((id: string) => id && id !== userId);
      const uniqueAuthorIds = [...new Set(authorIds)] as string[];

      const revealedIds =
        uniqueAuthorIds.length > 0
          ? await this.identityReveal.getRevealedUserIds(
              userId,
              uniqueAuthorIds,
            )
          : new Set<string>();

      // Step 5: Format all comments and build a map
      const commentMap = new Map<string, any>();
      const formattedComments: any[] = [];

      for (const comment of comments) {
        const formatted = this.formatComment(comment);

        // Apply identity reveal
        if (!comment.is_anonymous) {
          const isOwn = comment.user_id === userId;
          const isRevealed = revealedIds.has(comment.user_id);

          if (isOwn || isRevealed) {
            const realName = this.identityReveal.decryptRealName(
              comment.user_profile?.first_name_encrypted,
              comment.user_profile?.last_name_encrypted,
            );
            if (realName) formatted.author.display_name = realName;
          }
        }

        commentMap.set(comment.id, formatted);
        formattedComments.push({ raw: comment, formatted });
      }

      // Step 6: Build tree structure - attach replies to their parents
      const rootComments: any[] = [];
      for (const { raw, formatted } of formattedComments) {
        if (!raw.parent_comment_id) {
          rootComments.push(formatted);
        } else if (commentMap.has(raw.parent_comment_id)) {
          commentMap.get(raw.parent_comment_id).replies.push(formatted);
        }
      }

      // Step 7: Filter to only the paginated top-level comments, preserve order (newest first)
      const paginatedRoots = topLevelIds
        .map((id: string) => commentMap.get(id))
        .filter(Boolean);

      // Sort: user's comments first (newest first), then others (newest first)
      paginatedRoots.sort((a: any, b: any) => {
        const aIsMine = a.user_id === userId ? 0 : 1;
        const bIsMine = b.user_id === userId ? 0 : 1;
        if (aIsMine !== bIsMine) return aIsMine - bIsMine;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

      return {
        success: true,
        data: paginatedRoots,
        pagination: {
          page,
          limit,
          total: topLevelCount || 0,
          hasMore: (topLevelCount || 0) > offset + limit,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to fetch comments', { error });
      throw new BadRequestException('Failed to fetch comments');
    }
  }

  // ============ SHARES ============
  async shareItem(
    contentType: ContentType,
    contentId: string,
    userId: string,
    dto: ShareFeedItemDto,
  ) {
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

      await this.redis.delPattern('feeds:*');

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

  async unshareItem(
    contentType: ContentType,
    contentId: string,
    userId: string,
  ) {
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

      await this.redis.delPattern('feeds:*');

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
  async toggleBookmark(
    contentType: ContentType,
    contentId: string,
    userId: string,
  ) {
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

        await this.redis.delPattern('feeds:*');

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

        await this.redis.delPattern('feeds:*');

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
      const {
        data: bookmarks,
        error,
        count,
      } = await this.admin
        .from('feed_bookmarks')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException('Failed to fetch bookmarks');
      }

      if (!bookmarks || bookmarks.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page, limit, total: 0, hasMore: false },
        };
      }

      // Group bookmark content_ids by type
      const postIds = bookmarks
        .filter((b: any) => b.content_type === 'post')
        .map((b: any) => b.content_id);
      const topicIds = bookmarks
        .filter((b: any) => b.content_type === 'topic')
        .map((b: any) => b.content_id);
      const nookIds = bookmarks
        .filter((b: any) => b.content_type === 'nook_message')
        .map((b: any) => b.content_id);

      // Fetch actual content + engagement data in parallel
      const [
        postsResult,
        topicsResult,
        nooksResult,
        likesResult,
        feedAllReactions,
        feedUserReactions,
        topicUserReactions,
      ] = await Promise.all([
        postIds.length > 0
          ? this.admin
              .from('feed_posts')
              .select(
                `*, user_profile:user_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted, is_company_verified)`,
              )
              .in('id', postIds)
          : Promise.resolve({ data: [] }),
        topicIds.length > 0
          ? this.admin
              .from('forum_topics')
              .select(
                `*, user_profile:user_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted, is_company_verified), forum:forums(id, name)`,
              )
              .in('id', topicIds)
          : Promise.resolve({ data: [] }),
        nookIds.length > 0
          ? this.admin
              .from('nooks')
              .select(
                `*, user_profile:creator_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted, is_company_verified)`,
              )
              .in('id', nookIds)
              .gt('expires_at', new Date().toISOString())
          : Promise.resolve({ data: [] }),
        this.admin
          .from('feed_likes')
          .select('content_type, content_id')
          .eq('user_id', userId)
          .in(
            'content_id',
            bookmarks.map((b: any) => b.content_id),
          ),
        // Post reaction counts from feed_reactions
        postIds.length > 0
          ? this.admin
              .from('feed_reactions')
              .select('content_type, content_id, reaction_type')
              .in('content_id', postIds)
          : Promise.resolve({ data: [] }),
        // Post user reactions from feed_reactions
        postIds.length > 0
          ? this.admin
              .from('feed_reactions')
              .select('content_type, content_id, reaction_type')
              .eq('user_id', userId)
              .in('content_id', postIds)
          : Promise.resolve({ data: [] }),
        // Topic user reactions from topic_reactions
        topicIds.length > 0
          ? this.admin
              .from('topic_reactions')
              .select('topic_id, reaction_type')
              .eq('user_id', userId)
              .in('topic_id', topicIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Build content maps
      const postMap = new Map<string, any>(
        (postsResult.data || []).map((p: any) => [p.id, p]),
      );
      const topicMap = new Map<string, any>(
        (topicsResult.data || []).map((t: any) => [t.id, t]),
      );
      const nookMap = new Map<string, any>(
        (nooksResult.data || []).map((n: any) => [n.id, n]),
      );

      // Build post reaction counts (from feed_reactions)
      const postReactionCounts = new Map<string, Record<string, number>>();
      (feedAllReactions.data || []).forEach((r: any) => {
        const key = `${r.content_type}_${r.content_id}`;
        if (!postReactionCounts.has(key))
          postReactionCounts.set(key, { heard: 0, validated: 0, inspired: 0 });
        const counts = postReactionCounts.get(key)!;
        if (counts[r.reaction_type] !== undefined) counts[r.reaction_type]++;
      });

      // Build post user reactions (from feed_reactions)
      const postUserReactionMap = new Map<string, Set<string>>();
      (feedUserReactions.data || []).forEach((r: any) => {
        const key = `${r.content_type}_${r.content_id}`;
        if (!postUserReactionMap.has(key))
          postUserReactionMap.set(key, new Set());
        postUserReactionMap.get(key)!.add(r.reaction_type);
      });

      // Build topic user reactions (from topic_reactions)
      const topicUserReactionMap = new Map<string, Set<string>>();
      (topicUserReactions.data || []).forEach((r: any) => {
        if (!topicUserReactionMap.has(r.topic_id))
          topicUserReactionMap.set(r.topic_id, new Set());
        topicUserReactionMap.get(r.topic_id)!.add(r.reaction_type);
      });

      // Build user likes set
      const likeSet = new Set(
        (likesResult.data || []).map(
          (l: any) => `${l.content_type}_${l.content_id}`,
        ),
      );

      // Collect all author IDs for identity reveal
      const allAuthorIds: string[] = [];

      // Enrich bookmarks with full content
      const enrichedBookmarks = bookmarks.map((bookmark: any) => {
        const bmKey = `${bookmark.content_type}_${bookmark.content_id}`;
        const base = {
          bookmark_id: bookmark.id,
          content_type: bookmark.content_type,
          content_id: bookmark.content_id,
          bookmarked_at: bookmark.created_at,
          user_liked: likeSet.has(bmKey),
          user_bookmarked: true,
        };

        if (bookmark.content_type === 'post') {
          const post = postMap.get(bookmark.content_id);
          if (!post) return { ...base, content: null, author: null };
          if (post.user_id) allAuthorIds.push(post.user_id);
          const postUserReactions = postUserReactionMap.get(bmKey);
          return {
            ...base,
            user_id: post.user_id,
            content: { text: post.content, tags: post.tags },
            engagement: {
              likes: post.likes_count,
              comments: post.comments_count,
              shares: post.shares_count,
              views: post.views_count,
            },
            author: {
              display_name: post.is_anonymous
                ? 'Anonymous User'
                : post.user_profile?.username || 'Unknown',
              username: post.user_profile?.username,
              bio: post.is_anonymous ? null : post.user_profile?.bio || null,
              avatar: post.is_anonymous
                ? '👤'
                : post.user_profile?.avatar || 'User',
              first_name_encrypted: post.user_profile?.first_name_encrypted,
              last_name_encrypted: post.user_profile?.last_name_encrypted,
              is_company_verified: post.is_anonymous
                ? false
                : post.user_profile?.is_company_verified || false,
            },
            is_anonymous: post.is_anonymous,
            reaction_counts: postReactionCounts.get(bmKey) || {
              heard: 0,
              validated: 0,
              inspired: 0,
            },
            user_reactions: {
              heard: postUserReactions?.has('heard') || false,
              validated: postUserReactions?.has('validated') || false,
              inspired: postUserReactions?.has('inspired') || false,
            },
            created_at: post.created_at,
          };
        }

        if (bookmark.content_type === 'topic') {
          const topic = topicMap.get(bookmark.content_id);
          if (!topic) return { ...base, content: null, author: null };
          if (topic.user_id) allAuthorIds.push(topic.user_id);
          const totalReactions =
            (topic.reaction_seen_count || 0) +
            (topic.reaction_validated_count || 0) +
            (topic.reaction_inspired_count || 0) +
            (topic.reaction_heard_count || 0);
          const topicReactions = topicUserReactionMap.get(bookmark.content_id);
          return {
            ...base,
            user_id: topic.user_id,
            content: {
              title: topic.title,
              text: topic.content,
              forum_name: topic.forum?.name || 'Unknown Forum',
              tags: topic.tags,
            },
            engagement: {
              likes: totalReactions,
              comments: topic.comments_count,
              views: topic.views_count,
            },
            author: {
              display_name: topic.is_anonymous
                ? 'Anonymous User'
                : topic.user_profile?.username || 'Unknown',
              username: topic.user_profile?.username,
              bio: topic.is_anonymous ? null : topic.user_profile?.bio || null,
              avatar: topic.is_anonymous
                ? '👤'
                : topic.user_profile?.avatar || 'User',
              first_name_encrypted: topic.user_profile?.first_name_encrypted,
              last_name_encrypted: topic.user_profile?.last_name_encrypted,
              is_company_verified: topic.is_anonymous
                ? false
                : topic.user_profile?.is_company_verified || false,
            },
            is_anonymous: topic.is_anonymous,
            reaction_counts: {
              seen: topic.reaction_seen_count || 0,
              validated: topic.reaction_validated_count || 0,
              inspired: topic.reaction_inspired_count || 0,
              heard: topic.reaction_heard_count || 0,
            },
            user_reactions: {
              seen: topicReactions?.has('seen') || false,
              validated: topicReactions?.has('validated') || false,
              inspired: topicReactions?.has('inspired') || false,
              heard: topicReactions?.has('heard') || false,
            },
            created_at: topic.created_at,
          };
        }

        if (bookmark.content_type === 'nook_message') {
          const nook = nookMap.get(bookmark.content_id);
          if (!nook) return { ...base, content: null, author: null };
          const userProfile = Array.isArray(nook.user_profile)
            ? nook.user_profile[0]
            : nook.user_profile;
          if (nook.creator_id) allAuthorIds.push(nook.creator_id);
          const timeLeft = this.calculateNookTimeLeft(nook.expires_at);
          return {
            ...base,
            user_id: nook.creator_id,
            content: {
              title: nook.title,
              text: nook.description,
              nook_name: nook.title,
              nook_urgency: nook.urgency || 'medium',
              nook_scope: nook.scope || 'company',
              nook_temperature: nook.temperature || 'cool',
              nook_members: nook.members_count || 0,
              nook_time_left: timeLeft,
            },
            engagement: { likes: 0, comments: nook.messages_count || 0 },
            author: {
              display_name: userProfile?.username || 'Unknown',
              username: userProfile?.username,
              bio: userProfile?.bio || null,
              avatar: userProfile?.avatar || 'User',
              first_name_encrypted: userProfile?.first_name_encrypted,
              last_name_encrypted: userProfile?.last_name_encrypted,
              is_company_verified: userProfile?.is_company_verified || false,
            },
            is_anonymous: false,
            expires_at: nook.expires_at,
            created_at: nook.created_at,
          };
        }

        return base;
      });

      // Filter out bookmarks with no content (e.g. expired nooks)
      const validBookmarks = enrichedBookmarks.filter(
        (b: any) => b.content !== null,
      );

      // Apply identity reveals
      const uniqueAuthorIds = [
        ...new Set(allAuthorIds.filter((id) => id !== userId)),
      ];
      const revealedIds = await this.identityReveal.getRevealedUserIds(
        userId,
        uniqueAuthorIds,
      );

      validBookmarks.forEach((item: any) => {
        if (!item.author) return;
        const isOwn = item.user_id === userId;
        const isRevealed = revealedIds.has(item.user_id);

        if (isOwn || isRevealed) {
          const realName = this.identityReveal.decryptRealName(
            item.author.first_name_encrypted,
            item.author.last_name_encrypted,
          );
          if (realName) item.author.display_name = realName;
        }

        delete item.author.first_name_encrypted;
        delete item.author.last_name_encrypted;
        delete item.is_anonymous;
      });

      return {
        success: true,
        data: validBookmarks,
        pagination: {
          page,
          limit,
          total:
            validBookmarks.length < (count || 0)
              ? validBookmarks.length
              : count || 0,
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
  private async verifyContentExists(
    contentType: ContentType,
    contentId: string,
  ) {
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

  private async incrementLikeCount(
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('increment_feed_post_likes', {
        post_id: contentId,
      });

      if (error) {
        const { data: current } = await this.admin
          .from('feed_posts')
          .select('likes_count')
          .eq('id', contentId)
          .single();
        await this.admin
          .from('feed_posts')
          .update({ likes_count: (current?.likes_count || 0) + 1 })
          .eq('id', contentId);
      }
    }
  }

  private async decrementLikeCount(
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('decrement_feed_post_likes', {
        post_id: contentId,
      });

      if (error) {
        const { data: current } = await this.admin
          .from('feed_posts')
          .select('likes_count')
          .eq('id', contentId)
          .single();
        await this.admin
          .from('feed_posts')
          .update({ likes_count: Math.max(0, (current?.likes_count || 0) - 1) })
          .eq('id', contentId);
      }
    }
  }

  private async incrementCommentCount(
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('increment_feed_post_comments', {
        post_id: contentId,
      });

      if (error) {
        const { data: current } = await this.admin
          .from('feed_posts')
          .select('comments_count')
          .eq('id', contentId)
          .single();
        await this.admin
          .from('feed_posts')
          .update({ comments_count: (current?.comments_count || 0) + 1 })
          .eq('id', contentId);
      }
    }
  }

  private async incrementShareCount(
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('increment_feed_post_shares', {
        post_id: contentId,
      });

      if (error) {
        const { data: current } = await this.admin
          .from('feed_posts')
          .select('shares_count')
          .eq('id', contentId)
          .single();
        await this.admin
          .from('feed_posts')
          .update({ shares_count: (current?.shares_count || 0) + 1 })
          .eq('id', contentId);
      }
    }
  }

  private async decrementShareCount(
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType === 'post') {
      const { error } = await this.admin.rpc('decrement_feed_post_shares', {
        post_id: contentId,
      });

      if (error) {
        const { data: current } = await this.admin
          .from('feed_posts')
          .select('shares_count')
          .eq('id', contentId)
          .single();
        await this.admin
          .from('feed_posts')
          .update({
            shares_count: Math.max(0, (current?.shares_count || 0) - 1),
          })
          .eq('id', contentId);
      }
    }
  }

  private async createLikeNotification(
    contentType: ContentType,
    contentId: string,
    userId: string,
  ) {
    try {
      const contentOwnerId = await this.getContentOwnerId(
        contentType,
        contentId,
      );
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
      const contentOwnerId = await this.getContentOwnerId(
        contentType,
        contentId,
      );
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

  private async getContentOwnerId(
    contentType: ContentType,
    contentId: string,
  ): Promise<string | null> {
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
        avatar: comment.is_anonymous
          ? '👤'
          : comment.user_profile?.avatar || 'User',
        is_company_verified: comment.is_anonymous
          ? false
          : comment.user_profile?.is_company_verified || false,
      },
      replies: [] as any[],
    };
  }

  private calculateNookTimeLeft(expiresAt: string | null): string {
    if (!expiresAt) return 'N/A';
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  private async getReactionCounts(
    contentType: ContentType,
    contentId: string,
  ): Promise<Record<string, number>> {
    const { data: reactions } = await this.admin
      .from('feed_reactions')
      .select('reaction_type')
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    const counts: Record<string, number> = {
      heard: 0,
      validated: 0,
      inspired: 0,
    };
    (reactions || []).forEach((r: any) => {
      if (counts[r.reaction_type] !== undefined) {
        counts[r.reaction_type]++;
      }
    });
    return counts;
  }

  private async createReactionNotification(
    contentType: ContentType,
    contentId: string,
    userId: string,
    reactionType: string,
  ) {
    try {
      const contentOwnerId = await this.getContentOwnerId(
        contentType,
        contentId,
      );
      if (!contentOwnerId || contentOwnerId === userId) return;

      const { data: reactor } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', userId)
        .single();

      await this.notificationsService.createNotification({
        user_id: contentOwnerId,
        actor_id: userId,
        type: contentType === 'post' ? 'feed_like' : 'forum_like',
        title: 'New Reaction',
        message: `${reactor?.username || 'Someone'} reacted "${reactionType}" to your ${contentType === 'post' ? 'post' : contentType}`,
        action_url: this.getContentUrl(contentType, contentId),
        reference_id: contentId,
        reference_type: contentType,
        metadata: { reactionType },
        delivery_method: ['in_app'],
      });
    } catch (error) {
      logger.error('Failed to create reaction notification', { error });
    }
  }
}
