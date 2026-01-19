import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { CreateCommentDto } from '../dto/comment.dto';

@Injectable()
export class ReferralCommentsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getComments(referralId: string, limit = 50, offset = 0) {
    logger.info('Fetching comments', { referralId, limit, offset });

    try {
      const { data, error, count } = await this.admin
        .from('referral_comments')
        .select('*', { count: 'exact' })
        .eq('referral_post_id', referralId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Get author profiles
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const commentsWithAuthors = data.map((comment) => ({
        ...comment,
        author: profileMap.get(comment.user_id),
      }));

      return {
        success: true,
        data: commentsWithAuthors,
        pagination: { total: count, limit, offset },
      };
    } catch (error) {
      logger.error('Failed to fetch comments', { error });
      throw new BadRequestException('Failed to fetch comments');
    }
  }

  async createComment(
    userId: string,
    referralId: string,
    dto: CreateCommentDto,
  ) {
    logger.info('Creating comment', { userId, referralId });

    try {
      const { data, error } = await this.admin
        .from('referral_comments')
        .insert([
          {
            referral_post_id: referralId,
            user_id: userId,
            content: dto.content,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      await this.admin.rpc('increment_referral_comments', {
        referral_id: referralId,
      });

      return {
        success: true,
        data,
        message: 'Comment created successfully',
      };
    } catch (error) {
      logger.error('Failed to create comment', { error });
      throw new BadRequestException('Failed to create comment');
    }
  }

  async updateComment(
    userId: string,
    commentId: string,
    dto: CreateCommentDto,
  ) {
    logger.info('Updating comment', { userId, commentId });

    try {
      const { data: existing } = await this.admin
        .from('referral_comments')
        .select('user_id')
        .eq('id', commentId)
        .single();

      if (!existing) throw new NotFoundException('Comment not found');
      if (existing.user_id !== userId)
        throw new ForbiddenException('Not authorized');

      const { data, error } = await this.admin
        .from('referral_comments')
        .update({ content: dto.content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error('Failed to update comment', { error });
      throw new BadRequestException('Failed to update comment');
    }
  }

  async deleteComment(userId: string, commentId: string) {
    logger.info('Deleting comment', { userId, commentId });

    try {
      const { data: existing } = await this.admin
        .from('referral_comments')
        .select('user_id, referral_post_id')
        .eq('id', commentId)
        .single();

      if (!existing) throw new NotFoundException('Comment not found');
      if (existing.user_id !== userId)
        throw new ForbiddenException('Not authorized');

      const { error } = await this.admin
        .from('referral_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      await this.admin.rpc('decrement_referral_comments', {
        referral_id: existing.referral_post_id,
      });

      return { success: true, message: 'Comment deleted successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error('Failed to delete comment', { error });
      throw new BadRequestException('Failed to delete comment');
    }
  }
}
