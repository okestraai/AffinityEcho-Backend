import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { BookmarkDto } from '../dto/bookmark.dto';

@Injectable()
export class MentorshipBookmarksService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async createBookmark(userId: string, dto: BookmarkDto) {
    try {
      // Check if user exists
      const { data: user } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if bookmarked user exists and is onboarded
      const { data: bookmarkedUser } = await this.admin
        .from('user_profiles')
        .select('id, has_completed_onboarding, is_deleted, is_deactivated')
        .eq('id', dto.bookmarkedUserId)
        .single();

      if (
        !bookmarkedUser ||
        bookmarkedUser.is_deleted ||
        bookmarkedUser.is_deactivated ||
        !bookmarkedUser.has_completed_onboarding
      ) {
        throw new NotFoundException('User to bookmark not found');
      }

      // Check if bookmark already exists
      const { data: existingBookmark } = await this.admin
        .from('mentorship_bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('bookmarked_user_id', dto.bookmarkedUserId)
        .single();

      if (existingBookmark) {
        throw new BadRequestException('User is already bookmarked');
      }

      // Create bookmark
      const { data: bookmark, error } = await this.admin
        .from('mentorship_bookmarks')
        .insert({
          user_id: userId,
          bookmarked_user_id: dto.bookmarkedUserId,
          notes: dto.notes,
        })
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to create bookmark');
      }

      return {
        message: 'Bookmark created successfully',
        bookmark,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to create bookmark');
    }
  }

  async getBookmarks(userId: string) {
    try {
      const { data: bookmarks, error } = await this.admin
        .from('mentorship_bookmarks')
        .select(
          `
          id,
          notes,
          created_at,
          bookmarked_user:user_profiles!mentorship_bookmarks_target!inner(
            id,
            username,
            avatar,
            bio,
            job_title,
            company_type,
            mentor_bio,
            mentor_expertise,
            mentor_industries,
            mentoring_as,
            reputation_score,
            is_company_verified,
            has_completed_onboarding,
            is_deleted,
            is_deactivated
          )
        `,
        )
        .eq('user_id', userId)
        .eq('bookmarked_user.has_completed_onboarding', true)
        .eq('bookmarked_user.is_deleted', false)
        .eq('bookmarked_user.is_deactivated', false)
        .order('created_at', { ascending: false });

      if (error) {
        throw new BadRequestException('Failed to retrieve bookmarks');
      }

      return bookmarks || [];
    } catch (error) {
      throw new BadRequestException('Failed to retrieve bookmarks');
    }
  }

  async deleteBookmark(userId: string, bookmarkedUserId: string) {
    try {
      const { error } = await this.admin
        .from('mentorship_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('bookmarked_user_id', bookmarkedUserId);

      if (error) {
        throw new BadRequestException('Failed to delete bookmark');
      }

      return {
        message: 'Bookmark deleted successfully',
      };
    } catch (error) {
      throw new BadRequestException('Failed to delete bookmark');
    }
  }

  async updateBookmark(
    userId: string,
    bookmarkedUserId: string,
    notes: string,
  ) {
    try {
      const { data: bookmark, error } = await this.admin
        .from('mentorship_bookmarks')
        .update({
          notes,
        })
        .eq('user_id', userId)
        .eq('bookmarked_user_id', bookmarkedUserId)
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to update bookmark');
      }

      return {
        message: 'Bookmark updated successfully',
        bookmark,
      };
    } catch (error) {
      throw new BadRequestException('Failed to update bookmark');
    }
  }
}
