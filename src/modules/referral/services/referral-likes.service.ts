import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class ReferralLikesService {
  private admin;

  constructor(private config: ConfigService) {
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
        .select('likes_count')
        .eq('id', referralId)
        .single();

      if (!data) {
        return { success: true, data: { liked: true, likesCount: 0 } };
      }
      return {
        success: true,
        data: { liked: true, likesCount: data.likes_count },
      };
    } catch (error) {
      logger.error('Failed to like referral', { error });
      throw new BadRequestException('Failed to like referral');
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
      logger.error('Failed to unlike referral', { error });
      throw new BadRequestException('Failed to unlike referral');
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
      logger.error('Failed to fetch user likes', { error });
      throw new BadRequestException('Failed to fetch user likes');
    }
  }
}
