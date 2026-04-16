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
import { NotificationsService } from '../../notifications/notifications.service';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ReferralCommentsService {
  private admin;

  constructor(
    private config: ConfigService,
    private notificationsService: NotificationsService,
  ) {
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
      const userIds = [...new Set(data.map((c: any) => c.user_id))];
      const { data: profiles } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar, is_company_verified')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

      const commentsWithAuthors = data.map((comment: any) => ({
        ...comment,
        author: profileMap.get(comment.user_id),
      }));

      return {
        success: true,
        data: commentsWithAuthors,
        pagination: { total: count, limit, offset },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.COMMENTS_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.COMMENTS_FAILED);
    }
  }

  async createComment(
    userId: string,
    referralId: string,
    dto: CreateCommentDto,
  ) {
    logger.info('Creating comment', { userId, referralId });

    try {
      // Get referral post author
      const { data: referralPost } = await this.admin
        .from('referral_posts')
        .select('user_id, title_encrypted')
        .eq('id', referralId)
        .single();

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

      // Create notification for referral post author (if not commenting on own post)
      if (referralPost && referralPost.user_id !== userId) {
        try {
          const { data: commenter } = await this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single();

          await this.notificationsService.createNotification({
            user_id: referralPost.user_id,
            actor_id: userId,
            type: 'referral_comment',
            title: 'New Comment',
            message: `${commenter?.username || 'Someone'} commented on your referral post`,
            action_url: `/referral/posts/${referralId}`,
            reference_id: data.id,
            reference_type: 'referral_comment',
            metadata: { referral_post_id: referralId },
            delivery_method: ['in_app'],
          });
        } catch (notifError) {
          logger.error('Failed to create comment notification:', notifError);
        }
      }

      return {
        success: true,
        data,
        message: MSG.REFERRAL.COMMENT_CREATED,
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.COMMENT_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.COMMENT_FAILED);
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

      if (!existing)
        throw new NotFoundException(MSG.REFERRAL.COMMENT_NOT_FOUND);
      if (existing.user_id !== userId)
        throw new ForbiddenException(MSG.REFERRAL.NOT_AUTHORIZED);

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
      logger.error(MSG.REFERRAL.COMMENT_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.COMMENT_FAILED);
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

      if (!existing)
        throw new NotFoundException(MSG.REFERRAL.COMMENT_NOT_FOUND);
      if (existing.user_id !== userId)
        throw new ForbiddenException(MSG.REFERRAL.NOT_AUTHORIZED);

      const { error } = await this.admin
        .from('referral_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      await this.admin.rpc('decrement_referral_comments', {
        referral_id: existing.referral_post_id,
      });

      return { success: true, message: MSG.REFERRAL.COMMENT_DELETED };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error(MSG.REFERRAL.COMMENT_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.COMMENT_FAILED);
    }
  }
}
