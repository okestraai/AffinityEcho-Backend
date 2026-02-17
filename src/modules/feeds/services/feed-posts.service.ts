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

@Injectable()
export class FeedPostsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async createPost(userId: string, dto: CreatePostDto) {
    logger.info('Creating feed post', { userId });

    try {
      const { data: post, error } = await this.admin
        .from('feed_posts')
        .insert({
          user_id: userId,
          content: dto.content,
          visibility: dto.visibility || 'global',
          is_anonymous: dto.isAnonymous || false,
          tags: dto.tags || [],
        })
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            bio
          )
        `,
        )
        .single();

      if (error) {
        logger.error('Failed to create post', { error });
        throw new BadRequestException('Failed to create post');
      }

      logger.info('Post created successfully', { postId: post.id });

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
      const { data: post, error } = await this.admin
        .from('feed_posts')
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar,
            bio
          )
        `,
        )
        .eq('id', postId)
        .single();

      if (error || !post) {
        throw new NotFoundException('Post not found');
      }

      // Track view
      await this.trackView(postId, userId);

      return {
        success: true,
        data: this.formatPost(post),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to fetch post', { error });
      throw new BadRequestException('Failed to fetch post');
    }
  }

  async getUserPosts(userId: string, page: number = 1, limit: number = 20) {
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
            bio
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

      return {
        success: true,
        data: (posts || []).map((p) => this.formatPost(p)),
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
            bio
          )
        `,
        )
        .single();

      if (error) {
        logger.error('Failed to update post', { error });
        throw new BadRequestException('Failed to update post');
      }

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
        await this.admin
          .from('feed_posts')
          .update({ views_count: () => 'views_count + 1' })
          .eq('id', postId);
      }
    } catch (error) {
      logger.warn('Failed to track view', { error });
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
      },
    };
  }
}
