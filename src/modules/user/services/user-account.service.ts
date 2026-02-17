import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { DeactivateAccountDto, DeleteAccountDto } from '../dto/update-profile.dto';
import { USER_PROFILE_OWN_FIELDS } from '../../../common/constants/select-fields';

@Injectable()
export class UserAccountService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  // ============ ACCOUNT DEACTIVATION ============

  async deactivateAccount(userId: string, dto: DeactivateAccountDto) {
    logger.info('Deactivating account', { userId });

    try {
      // Verify user exists
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, is_deactivated')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      if (user.is_deactivated) {
        throw new BadRequestException('Account is already deactivated');
      }

      // Deactivate account
      const { error } = await this.admin
        .from('user_profiles')
        .update({
          is_deactivated: true,
          deactivation_reason: dto.reason || null,
          deactivated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        throw new BadRequestException('Failed to deactivate account');
      }

      // Log the deactivation
      logger.info('Account deactivated', {
        userId,
        reason: dto.reason,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: 'Account deactivated successfully. You can reactivate it by logging in again.',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to deactivate account', { error });
      throw new BadRequestException('Failed to deactivate account');
    }
  }

  async reactivateAccount(userId: string) {
    logger.info('Reactivating account', { userId });

    try {
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, is_deactivated')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      if (!user.is_deactivated) {
        throw new BadRequestException('Account is not deactivated');
      }

      const { error } = await this.admin
        .from('user_profiles')
        .update({
          is_deactivated: false,
          deactivation_reason: null,
          deactivated_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        throw new BadRequestException('Failed to reactivate account');
      }

      logger.info('Account reactivated', { userId });

      return {
        success: true,
        message: 'Account reactivated successfully. Welcome back!',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to reactivate account', { error });
      throw new BadRequestException('Failed to reactivate account');
    }
  }

  // ============ ACCOUNT DELETION ============

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    logger.info('Deleting account', { userId });

    try {
      // Verify password or confirmation
      if (!dto.confirmDeletion) {
        throw new BadRequestException('Account deletion must be confirmed');
      }

      // Verify user exists
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, email, username')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      // Instead of hard delete, mark as deleted and anonymize data
      const anonymousEmail = `deleted_${userId}@deleted.user`;
      const anonymousUsername = `deleted_user_${userId.substring(0, 8)}`;

      const { error } = await this.admin
        .from('user_profiles')
        .update({
          email: anonymousEmail,
          username: anonymousUsername,
          avatar: null,
          bio: null,
          job_title: null,
          location: null,
          skills: [],
          linkedin_url: null,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deletion_reason: dto.reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        throw new BadRequestException('Failed to delete account');
      }

      // Log the deletion (no PII — email/username already anonymized above)
      logger.warn('Account deleted', {
        userId,
        reason: dto.reason,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: 'Account deleted successfully. We are sorry to see you go.',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to delete account', { error });
      throw new BadRequestException('Failed to delete account');
    }
  }

  // ============ CHANGE PASSWORD ============

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    logger.info('Changing password', { userId });

    try {
      // Get user email from profile
      const { data: profile, error: profileError } = await this.admin
        .from('user_profiles')
        .select('email')
        .eq('id', userId)
        .single();

      if (profileError || !profile?.email) {
        throw new BadRequestException('User not found');
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await this.admin.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new BadRequestException('Current password is incorrect');
      }

      // Update password using admin API
      const { error: updateError } = await this.admin.auth.admin.updateUserById(
        userId,
        { password: newPassword },
      );

      if (updateError) {
        logger.error('Password update failed', { userId, error: updateError.message });
        if (updateError.message.includes('password')) {
          throw new BadRequestException(
            'Password does not meet security requirements. Please choose a stronger password.',
          );
        }
        throw new BadRequestException('Failed to update password');
      }

      logger.info('Password changed successfully', { userId });

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to change password', { error });
      throw new BadRequestException('Failed to change password');
    }
  }

  // ============ DATA EXPORT ============

  async exportUserData(userId: string, category: string = 'all') {
    logger.info('Exporting user data', { userId, category });

    try {
      // Always fetch profile as base
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select(USER_PROFILE_OWN_FIELDS)
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new NotFoundException('User not found');
      }

      const exportData: any = {
        exportDate: new Date().toISOString(),
        category,
      };

      // Profile data
      if (category === 'all' || category === 'profile') {
        exportData.profile = {
          id: profile.id,
          email: profile.email,
          username: profile.username,
          avatar: profile.avatar,
          bio: profile.bio,
          jobTitle: profile.job_title,
          location: profile.location,
          skills: profile.skills,
          linkedinUrl: profile.linkedin_url,
          badges: profile.badges,
          createdAt: profile.created_at,
          stats: {
            totalPosts: profile.total_posts,
            totalComments: profile.total_comments,
            helpfulVotesReceived: profile.helpful_votes_received,
            reputationScore: profile.reputation_score,
          },
        };
      }

      // Posts data
      if (category === 'all' || category === 'posts') {
        const { data: posts } = await this.admin
          .from('feed_posts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const { data: topics } = await this.admin
          .from('forum_topics')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const { data: referralPosts } = await this.admin
          .from('referral_posts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        exportData.posts = {
          feedPosts: posts || [],
          forumTopics: topics || [],
          referralPosts: referralPosts || [],
        };
      }

      // Comments data
      if (category === 'all' || category === 'comments') {
        const { data: forumComments } = await this.admin
          .from('forum_comments')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const { data: feedComments } = await this.admin
          .from('feed_comments')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        exportData.comments = {
          forumComments: forumComments || [],
          feedComments: feedComments || [],
        };
      }

      // Connections data
      if (category === 'all' || category === 'connections') {
        const { data: connections } = await this.admin
          .from('referral_connections')
          .select('*')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false });

        const { data: followers } = await this.admin
          .from('user_follows')
          .select('*')
          .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

        const { data: nookMemberships } = await this.admin
          .from('nook_members')
          .select('nook_id, joined_at')
          .eq('user_id', userId);

        exportData.connections = {
          referralConnections: connections || [],
          follows: followers || [],
          nookMemberships: nookMemberships || [],
        };
      }

      // Activity data
      if (category === 'all' || category === 'activity') {
        const { data: notifications } = await this.admin
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100);

        const { data: likes } = await this.admin
          .from('feed_likes')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const { data: bookmarks } = await this.admin
          .from('feed_bookmarks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        exportData.activity = {
          notifications: notifications || [],
          likes: likes || [],
          bookmarks: bookmarks || [],
        };
      }

      logger.info('User data exported successfully', { userId, category });

      return {
        success: true,
        data: exportData,
        message: `User data exported successfully (category: ${category})`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to export user data', { error });
      throw new BadRequestException('Failed to export user data');
    }
  }
}
