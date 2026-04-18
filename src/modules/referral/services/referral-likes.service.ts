import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import logger from '../../../common/utils/logger.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ReferralLikesService {
  private admin;

  constructor(
    private config: ConfigService,
    private identityReveal: IdentityRevealUtil,
    private notificationsService: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async likeReferral(userId: string, referralId: string) {
    logger.info('Liking referral', { userId, referralId });

    try {
      const { error } = await this.admin
        .from('referral_likes')
        .insert({ referral_post_id: referralId, user_id: userId });

      if (error) throw error;

      await this.admin.rpc('increment_referral_likes', {
        referral_id: referralId,
      });

      const { data } = await this.admin
        .from('referral_posts')
        .select('likes_count, user_id')
        .eq('id', referralId)
        .single();

      // Create notification for referral post author (if not liking own post)
      if (data && data.user_id !== userId) {
        try {
          const actorName = await this.identityReveal.resolveNotificationName(userId, data.user_id);

          await this.notificationsService.createNotification({
            user_id: data.user_id,
            actor_id: userId,
            type: 'referral_like',
            title: 'New Like',
            message: `${actorName} liked your referral post`,
            action_url: `/referral/posts/${referralId}`,
            reference_id: referralId,
            reference_type: 'referral_post',
            metadata: {},
            delivery_method: ['in_app'],
          });
        } catch (notifError) {
          logger.error('Failed to create like notification:', notifError);
        }
      }

      if (!data) {
        return { success: true, data: { liked: true, likesCount: 0 } };
      }
      return {
        success: true,
        data: { liked: true, likesCount: data.likes_count },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.LIKE_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.LIKE_FAILED);
    }
  }

  async unlikeReferral(userId: string, referralId: string) {
    logger.info('Unliking referral', { userId, referralId });

    try {
      const { error } = await this.admin
        .from('referral_likes')
        .delete()
        .eq('referral_post_id', referralId)
        .eq('user_id', userId);

      if (error) throw error;

      await this.admin.rpc('decrement_referral_likes', {
        referral_id: referralId,
      });

      const { data } = await this.admin
        .from('referral_posts')
        .select('likes_count')
        .eq('id', referralId)
        .single();

      if (!data) {
        return { success: true, data: { liked: false, likesCount: 0 } };
      }
      return {
        success: true,
        data: { liked: false, likesCount: data.likes_count },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.UNLIKE_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.UNLIKE_FAILED);
    }
  }

  async getUserLikes(userId: string) {
    logger.info('Fetching user likes', { userId });

    try {
      const { data, error } = await this.admin
        .from('referral_likes')
        .select('referral_post_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      logger.error(MSG.REFERRAL.LIKES_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.LIKES_FAILED);
    }
  }
}
