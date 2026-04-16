import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ReferralBookmarksService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async bookmarkReferral(userId: string, referralId: string) {
    logger.info('Bookmarking referral', { userId, referralId });

    try {
      const { error } = await this.admin
        .from('referral_bookmarks')
        .insert({ referral_post_id: referralId, user_id: userId });

      if (error) throw error;

      await this.admin.rpc('increment_referral_bookmarks', {
        referral_id: referralId,
      });

      const { data } = await this.admin
        .from('referral_posts')
        .select('bookmarks_count')
        .eq('id', referralId)
        .single();

      return {
        success: true,
        data: { bookmarked: true, bookmarksCount: data?.bookmarks_count || 0 },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.BOOKMARK_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.BOOKMARK_FAILED);
    }
  }

  async removeBookmark(userId: string, referralId: string) {
    logger.info('Removing bookmark', { userId, referralId });

    try {
      const { error } = await this.admin
        .from('referral_bookmarks')
        .delete()
        .eq('referral_post_id', referralId)
        .eq('user_id', userId);

      if (error) throw error;

      await this.admin.rpc('decrement_referral_bookmarks', {
        referral_id: referralId,
      });

      const { data } = await this.admin
        .from('referral_posts')
        .select('bookmarks_count')
        .eq('id', referralId)
        .single();

      return {
        success: true,
        data: { bookmarked: false, bookmarksCount: data?.bookmarks_count || 0 },
      };
    } catch (error) {
      logger.error(MSG.REFERRAL.UNBOOKMARK_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.UNBOOKMARK_FAILED);
    }
  }

  async getUserBookmarks(userId: string) {
    logger.info('Fetching user bookmarks', { userId });

    try {
      const { data, error } = await this.admin
        .from('referral_bookmarks')
        .select('referral_post_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      logger.error(MSG.REFERRAL.BOOKMARKS_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.BOOKMARKS_FAILED);
    }
  }
}
