import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { CreatePostDto } from '../dto/create-post.dto';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { MentionService } from '../../mentions/mention.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class FeedPostsService {
  private admin;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
    private mentionService: MentionService,
    private notificationsService: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async createPost(userId: string, dto: CreatePostDto) {
    logger.info('Creating feed post', { userId });

    try {
      const insertData: any = {
        user_id: userId,
        content: dto.content,
        visibility: dto.visibility || 'global',
        is_anonymous: dto.isAnonymous || false,
        tags: dto.tags || [],
      };

      // Stamp company_name on company-scoped posts
      if (insertData.visibility === 'company') {
        const { data: userProfile } = await this.admin
          .from('user_profiles')
          .select('company_encrypted')
          .eq('id', userId)
          .single();

        if (userProfile?.company_encrypted) {
          try {
            insertData.company_name = this.encryption.decrypt(userProfile.company_encrypted);
          } catch (e) {
            logger.warn('Failed to decrypt company for post stamp', { userId });
          }
        }
      }

      const { data: post, error } = await this.admin
        .from('feed_posts')
        .insert(insertData)
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            bio,
            is_company_verified
          )
        `,
        )
        .single();

      if (error) {
        logger.error('Failed to create post', { error });
        throw new BadRequestException('Failed to create post');
      }

      logger.info('Post created successfully', { postId: post.id });

      await this.redis.delPattern('feeds:*');

      // Process @mentions in post content
      const usernames = this.mentionService.parseMentions(dto.content);
      if (usernames.length > 0) {
        this.mentionService.processMentions(userId, usernames, 'post', post.id);
      }

      // Notify followers about new post (skip for anonymous posts)
      if (!dto.isAnonymous) {
        this.notifyFollowers(userId, post).catch((err) =>
          logger.warn('Failed to notify followers', { error: err }),
        );
      }

      return {
        success: true,
        data: this.formatPost(post),
        message: 'Post created successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Unexpected error creating post', { error });
      throw new BadRequestException('Failed to create post');
    }
  }

  async getPostById(postId: string, userId: string) {
    logger.info('Fetching post by ID', { postId, userId });

    try {
      // Fetch post + user engagement data in parallel
      const [postResult, likeResult, bookmarkResult, shareResult, reactionsResult, allReactionsResult] = await Promise.all([
        this.admin
          .from('feed_posts')
          .select(
            `
            *,
            user_profile:user_id(
              id,
              username,
              avatar,
              bio,
              first_name_encrypted,
              last_name_encrypted,
              is_company_verified
            )
          `,
          )
          .eq('id', postId)
          .single(),
        this.admin
          .from('feed_likes')
          .select('id')
          .eq('user_id', userId)
          .eq('content_type', 'post')
          .eq('content_id', postId)
          .maybeSingle(),
        this.admin
          .from('feed_bookmarks')
          .select('id')
          .eq('user_id', userId)
          .eq('content_type', 'post')
          .eq('content_id', postId)
          .maybeSingle(),
        this.admin
          .from('feed_shares')
          .select('id')
          .eq('user_id', userId)
          .eq('content_type', 'post')
          .eq('content_id', postId)
          .maybeSingle(),
        this.admin
          .from('feed_reactions')
          .select('reaction_type')
          .eq('user_id', userId)
          .eq('content_id', postId),
        this.admin
          .from('feed_reactions')
          .select('reaction_type')
          .eq('content_id', postId),
      ]);

      const { data: post, error } = postResult;

      if (error || !post) {
        throw new NotFoundException('Post not found');
      }

      // Track view (fire-and-forget)
      this.trackView(postId, userId).catch(() => {});

      const formatted = this.formatPost(post);

      // Engagement status
      const userReactionTypes = new Set((reactionsResult.data || []).map((r: any) => r.reaction_type));
      const reactionCounts: Record<string, number> = { heard: 0, validated: 0, inspired: 0 };
      (allReactionsResult.data || []).forEach((r: any) => {
        if (reactionCounts[r.reaction_type] !== undefined) {
          reactionCounts[r.reaction_type]++;
        }
      });

      // Apply identity reveal
      const isOwn = post.user_id === userId;
      let shouldReveal = isOwn;
      if (!isOwn) {
        const revealedIds = await this.identityReveal.getRevealedUserIds(userId, [post.user_id]);
        shouldReveal = revealedIds.has(post.user_id);
      }
      if (shouldReveal) {
        const realName = this.identityReveal.decryptRealName(
          post.user_profile?.first_name_encrypted,
          post.user_profile?.last_name_encrypted,
        );
        if (realName) formatted.author.display_name = realName;
      }

      return {
        success: true,
        data: {
          ...formatted,
          user_liked: !!likeResult.data,
          user_bookmarked: !!bookmarkResult.data,
          user_shared: !!shareResult.data,
          user_reactions: {
            heard: userReactionTypes.has('heard'),
            validated: userReactionTypes.has('validated'),
            inspired: userReactionTypes.has('inspired'),
          },
          reaction_counts: reactionCounts,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to fetch post', { error });
      throw new BadRequestException('Failed to fetch post');
    }
  }

  async getUserPosts(userId: string, page: number = 1, limit: number = 20, requestingUserId?: string) {
    logger.info('Fetching user posts', { userId, page, limit });

    const offset = (page - 1) * limit;

    try {
      const { data: posts, error, count } = await this.admin
        .from('feed_posts')
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            bio,
            first_name_encrypted,
            last_name_encrypted,
            is_company_verified
          )
        `,
          { count: 'exact' },
        )
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Failed to fetch user posts', { error });
        throw new BadRequestException('Failed to fetch posts');
      }

      const formatted = (posts || []).map((p) => this.formatPost(p));

      // Apply identity reveal for the author
      const viewerId = requestingUserId || userId;
      const isOwnPosts = viewerId === userId;

      if (formatted.length > 0) {
        let revealedIds = new Set<string>();
        if (!isOwnPosts) {
          revealedIds = await this.identityReveal.getRevealedUserIds(viewerId, [userId]);
        }

        const shouldReveal = isOwnPosts || revealedIds.has(userId);
        if (shouldReveal && posts && posts.length > 0) {
          const profile = posts[0].user_profile;
          const realName = this.identityReveal.decryptRealName(
            profile?.first_name_encrypted,
            profile?.last_name_encrypted,
          );
          if (realName) {
            formatted.forEach((p: any) => {
              p.author.display_name = realName;
            });
          }
        }
      }

      return {
        success: true,
        data: formatted,
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Unexpected error fetching user posts', { error });
      throw new BadRequestException('Failed to fetch posts');
    }
  }

  async updatePost(postId: string, userId: string, dto: Partial<CreatePostDto>) {
    logger.info('Updating post', { postId, userId });

    try {
      // Verify ownership
      const { data: existing } = await this.admin
        .from('feed_posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (!existing) {
        throw new NotFoundException('Post not found');
      }

      if (existing.user_id !== userId) {
        throw new ForbiddenException('You can only edit your own posts');
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (dto.content) updateData.content = dto.content;
      if (dto.visibility) updateData.visibility = dto.visibility;
      if (dto.tags !== undefined) updateData.tags = dto.tags;

      const { data: post, error } = await this.admin
        .from('feed_posts')
        .update(updateData)
        .eq('id', postId)
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            bio,
            is_company_verified
          )
        `,
        )
        .single();

      if (error) {
        logger.error('Failed to update post', { error });
        throw new BadRequestException('Failed to update post');
      }

      await this.redis.delPattern('feeds:*');

      return {
        success: true,
        data: this.formatPost(post),
        message: 'Post updated successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error updating post', { error });
      throw new BadRequestException('Failed to update post');
    }
  }

  async deletePost(postId: string, userId: string) {
    logger.info('Deleting post', { postId, userId });

    try {
      // Verify ownership
      const { data: existing } = await this.admin
        .from('feed_posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (!existing) {
        throw new NotFoundException('Post not found');
      }

      if (existing.user_id !== userId) {
        throw new ForbiddenException('You can only delete your own posts');
      }

      // Soft delete by archiving
      const { error } = await this.admin
        .from('feed_posts')
        .update({ is_archived: true })
        .eq('id', postId);

      if (error) {
        logger.error('Failed to delete post', { error });
        throw new BadRequestException('Failed to delete post');
      }

      await this.redis.delPattern('feeds:*');

      return {
        success: true,
        message: 'Post deleted successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error deleting post', { error });
      throw new BadRequestException('Failed to delete post');
    }
  }

  async pinPost(postId: string, userId: string) {
    logger.info('Pinning post', { postId, userId });

    try {
      const { data: existing } = await this.admin
        .from('feed_posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (!existing) {
        throw new NotFoundException('Post not found');
      }

      if (existing.user_id !== userId) {
        throw new ForbiddenException('You can only pin your own posts');
      }

      const { error } = await this.admin
        .from('feed_posts')
        .update({ is_pinned: true })
        .eq('id', postId);

      if (error) {
        throw new BadRequestException('Failed to pin post');
      }

      await this.redis.delPattern('feeds:*');

      return {
        success: true,
        message: 'Post pinned successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error pinning post', { error });
      throw new BadRequestException('Failed to pin post');
    }
  }

  async unpinPost(postId: string, userId: string) {
    logger.info('Unpinning post', { postId, userId });

    try {
      const { data: existing } = await this.admin
        .from('feed_posts')
        .select('user_id')
        .eq('id', postId)
        .single();

      if (!existing) {
        throw new NotFoundException('Post not found');
      }

      if (existing.user_id !== userId) {
        throw new ForbiddenException('You can only unpin your own posts');
      }

      const { error } = await this.admin
        .from('feed_posts')
        .update({ is_pinned: false })
        .eq('id', postId);

      if (error) {
        throw new BadRequestException('Failed to unpin post');
      }

      await this.redis.delPattern('feeds:*');

      return {
        success: true,
        message: 'Post unpinned successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error unpinning post', { error });
      throw new BadRequestException('Failed to unpin post');
    }
  }

  private async trackView(postId: string, userId: string) {
    try {
      // Insert or ignore if already viewed
      await this.admin.from('feed_views').upsert(
        {
          user_id: userId,
          content_type: 'post',
          content_id: postId,
        },
        { onConflict: 'user_id,content_type,content_id' },
      );

      // Increment view count
      const { error: rpcError } = await this.admin.rpc('increment_feed_post_views', {
        post_id: postId,
      });

      if (rpcError) {
        // Fallback if RPC doesn't exist
        const { data: current } = await this.admin
          .from('feed_posts')
          .select('views_count')
          .eq('id', postId)
          .single();
        await this.admin
          .from('feed_posts')
          .update({ views_count: (current?.views_count || 0) + 1 })
          .eq('id', postId);
      }
    } catch (error) {
      logger.warn('Failed to track view', { error });
    }
  }

  private async notifyFollowers(authorId: string, post: any) {
    try {
      const { data: followers } = await this.admin
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', authorId);

      if (!followers?.length) return;

      const authorName = post.user_profile?.username || 'Someone';

      const notifications = followers.map((f: any) => ({
        user_id: f.follower_id,
        actor_id: authorId,
        type: 'followed_user_post',
        title: 'New Post',
        message: `${authorName} shared a new post`,
        action_url: `/feeds/post/${post.id}`,
        reference_id: post.id,
        reference_type: 'feed_post',
        metadata: {},
        delivery_method: ['in_app'],
      }));

      await this.notificationsService.createBulkNotifications(notifications);
    } catch (error) {
      logger.warn('Failed to notify followers about new post', { error });
    }
  }

  private formatPost(post: any) {
    return {
      id: post.id,
      user_id: post.user_id,
      content: post.content,
      visibility: post.visibility,
      is_anonymous: post.is_anonymous,
      tags: post.tags,
      likes_count: post.likes_count,
      comments_count: post.comments_count,
      shares_count: post.shares_count,
      views_count: post.views_count,
      is_pinned: post.is_pinned,
      is_archived: post.is_archived,
      created_at: post.created_at,
      updated_at: post.updated_at,
      author: {
        display_name: post.is_anonymous
          ? 'Anonymous User'
          : post.user_profile?.username || 'Unknown',
        bio: post.is_anonymous ? null : post.user_profile?.bio || null,
        avatar: post.is_anonymous ? '👤' : post.user_profile?.avatar || 'User',
        is_company_verified: post.is_anonymous ? false : post.user_profile?.is_company_verified || false,
      },
    };
  }
}
