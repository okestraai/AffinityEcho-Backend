import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { ContentSafetyService } from '../../content-safety/content-safety.service';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ReferralBookmarksService {
  private admin;

  constructor(
    private config: ConfigService,
    private contentSafety: ContentSafetyService,
  ) {
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

      // Filter out hidden and blocked content
      const [hiddenIds, blockedIds] = await Promise.all([
        this.contentSafety.getHiddenContentIds(userId, 'referral'),
        this.contentSafety.getBlockedUserIds(userId),
      ]);

      let filtered = data || [];
      if (hiddenIds.length > 0) {
        const hiddenSet = new Set(hiddenIds);
        filtered = filtered.filter((b: any) => !hiddenSet.has(b.referral_post_id));
      }

      if (blockedIds.length > 0 && filtered.length > 0) {
        const postIds = filtered.map((b: any) => b.referral_post_id);
        const { data: posts } = await this.admin
          .from('referral_posts')
          .select('id, user_id')
          .in('id', postIds);

        if (posts) {
          const blockedSet = new Set(blockedIds);
          const blockedPostIds = new Set(
            posts.filter((p: any) => blockedSet.has(p.user_id)).map((p: any) => p.id),
          );
          filtered = filtered.filter((b: any) => !blockedPostIds.has(b.referral_post_id));
        }
      }

      return { success: true, data: filtered };
    } catch (error) {
      logger.error(MSG.REFERRAL.BOOKMARKS_FAILED, { error });
      throw new BadRequestException(MSG.REFERRAL.BOOKMARKS_FAILED);
    }
  }
}
