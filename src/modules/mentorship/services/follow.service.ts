import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class FollowService {
  private admin;

  constructor(
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  private decryptField(value: string | null | undefined): string {
    if (!value) return '';
    try {
      return this.encryption.decrypt(value);
    } catch {
      return '';
    }
  }

  async followUser(followerId: string, followingId: string) {
    try {
      // Check if users exist
      const [
        { data: follower, error: followerError },
        { data: following, error: followingError },
      ] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select('id, username')
          .eq('id', followerId)
          .single(),
        this.admin
          .from('user_profiles')
          .select('id, username')
          .eq('id', followingId)
          .single(),
      ]);

      if (!follower) {
        throw new NotFoundException('Follower user not found');
      }

      if (!following) {
        throw new NotFoundException('User to follow not found');
      }

      // Check if the target user is deleted or deactivated
      const { data: targetProfile } = await this.admin
        .from('user_profiles')
        .select('is_deleted, is_deactivated')
        .eq('id', followingId)
        .single();

      if (targetProfile?.is_deleted || targetProfile?.is_deactivated) {
        throw new NotFoundException('User to follow not found');
      }

      if (followerId === followingId) {
        throw new BadRequestException('Cannot follow yourself');
      }

      // Check if already following - use maybeSingle to avoid throwing error if not found
      const { data: existingFollow } =
        await this.admin
          .from('user_follows')
          .select('id')
          .eq('follower_id', followerId)
          .eq('following_id', followingId)
          .maybeSingle();

      if (existingFollow) {
        throw new BadRequestException('Already following this user');
      }

      // Create follow relationship - Generate UUID for id
      const { v4: uuidv4 } = require('uuid');
      const followId = uuidv4();

      const { data: follow, error: followError } = await this.admin
        .from('user_follows')
        .insert({
          id: followId,
          follower_id: followerId,
          following_id: followingId,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (followError) {
        logger.error('Follow creation failed', { module: 'FollowService', error: followError });
        throw new BadRequestException(
          `Failed to follow user: ${followError.message}`,
        );
      }

      // Create notification for the followed user
      await this.createNotification(
        followingId,
        followerId,
        'user_followed',
        'New Follower',
        `${follower.username || 'Someone'} started following you`,
        `/mentorship/profile/${followerId}`,
        followerId,
        'user_profile',
      );

      return {
        success: true,
        message: 'Successfully followed user',
        data: {
          followId: follow.id,
        },
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to follow user: ${errorMessage}`);
    }
  }

  async unfollowUser(followerId: string, followingId: string) {
    try {
      // Get follower username for notification message
      const { data: follower } = await this.admin
        .from('user_profiles')
        .select('username')
        .eq('id', followerId)
        .single();

      const { error } = await this.admin
        .from('user_follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

      if (error) {
        logger.error('Unfollow failed', { module: 'FollowService', error });
        throw new BadRequestException(
          `Failed to unfollow user: ${error.message}`,
        );
      }

      // Send unfollow notification
      await this.createNotification(
        followingId,
        followerId,
        'user_unfollowed',
        'User Unfollowed',
        `${follower?.username || 'Someone'} unfollowed you`,
        `/mentorship/profile/${followerId}`,
        followerId,
        'user_profile',
      );

      return {
        success: true,
        message: 'Successfully unfollowed user',
        data: {},
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to unfollow user: ${errorMessage}`);
    }
  }

  async getFollowing(userId: string, type?: string, currentUserId?: string) {
    try {
      let query = this.admin
        .from('user_follows')
        .select(
          `
          id,
          created_at,
          following:user_profiles!user_follows_following_id_fkey(
            id,
            username,
            avatar,
            job_title,
            company_type,
            mentoring_as,
            is_willing_to_mentor,
            mentor_bio,
            location,
            years_experience,
            career_level_encrypted,
            affinity_tags_encrypted,
            first_name_encrypted,
            last_name_encrypted,
            has_completed_onboarding,
            is_deleted,
            is_deactivated
          )
        `,
        )
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });

      const { data: follows, error } = await query;

      if (error) {
        logger.error('Failed to get following list', { module: 'FollowService', error });
        throw new BadRequestException('Failed to get following list');
      }

      // Process follows - extract the user from the array and filter out deleted/deactivated
      const processedFollows = (follows || [])
        .map((follow: any) => {
          const user = follow.following?.[0] || follow.following || {};
          let affinityTags: string[] = [];
          if (user.affinity_tags_encrypted) {
            try {
              const decrypted = this.decryptField(user.affinity_tags_encrypted);
              affinityTags = decrypted ? JSON.parse(decrypted) : [];
            } catch {
              try { affinityTags = JSON.parse(user.affinity_tags_encrypted); } catch { affinityTags = []; }
            }
          }
          return {
            id: follow.id,
            created_at: follow.created_at,
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              job_title: user.job_title,
              company_type: user.company_type,
              mentoring_as: user.mentoring_as,
              is_willing_to_mentor: user.is_willing_to_mentor,
              mentor_bio: user.mentor_bio,
              location: user.location,
              years_experience: user.years_experience,
              career_level: this.decryptField(user.career_level_encrypted),
              affinity_tags: affinityTags,
              first_name_encrypted: user.first_name_encrypted,
              last_name_encrypted: user.last_name_encrypted,
              has_completed_onboarding: user.has_completed_onboarding,
              is_deleted: user.is_deleted,
              is_deactivated: user.is_deactivated,
            },
          };
        })
        .filter((f) => !f.user.is_deleted && !f.user.is_deactivated && f.user.has_completed_onboarding !== false);

      // Filter by type if specified
      let filteredFollows = processedFollows;
      if (type === 'mentors') {
        filteredFollows = processedFollows.filter((f) => {
          const user = f.user;
          return (
            user.is_willing_to_mentor ||
            user.mentoring_as === 'mentor' ||
            user.mentoring_as === 'both'
          );
        });
      } else if (type === 'mentees') {
        filteredFollows = processedFollows.filter((f) => {
          const user = f.user;
          return user.mentoring_as === 'mentee' || user.mentoring_as === 'both';
        });
      }

      // Apply identity reveal — show real name for revealed users and self
      const viewerId = currentUserId || userId;
      const otherUserIds = filteredFollows
        .filter((f) => f.user.id && f.user.id !== viewerId)
        .map((f) => f.user.id);
      const revealedIds = await this.identityReveal.getRevealedUserIds(viewerId, otherUserIds);

      return {
        success: true,
        message: 'Following list retrieved successfully',
        data: {
          following: filteredFollows.map((f) => {
            const isOwnEntry = f.user.id === viewerId;
            const isRevealed = revealedIds.has(f.user.id);
            let displayName = f.user.username;
            if (isOwnEntry || isRevealed) {
              const realName = this.identityReveal.decryptRealName(
                f.user.first_name_encrypted,
                f.user.last_name_encrypted,
              );
              if (realName) displayName = realName;
            }
            const { first_name_encrypted, last_name_encrypted, ...userWithout } = f.user;
            return {
              ...userWithout,
              display_name: displayName,
              followId: f.id,
              followedAt: f.created_at,
            };
          }),
          total: filteredFollows.length,
        },
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to get following list', { module: 'FollowService', error });
      throw new BadRequestException('Failed to get following list');
    }
  }

  async getFollowers(userId: string, type?: string, currentUserId?: string) {
    try {
      let query = this.admin
        .from('user_follows')
        .select(
          `
          id,
          created_at,
          follower:user_profiles!user_follows_follower_id_fkey(
            id,
            username,
            avatar,
            job_title,
            company_type,
            mentoring_as,
            is_willing_to_mentor,
            mentor_bio,
            location,
            years_experience,
            career_level_encrypted,
            affinity_tags_encrypted,
            first_name_encrypted,
            last_name_encrypted,
            has_completed_onboarding,
            is_deleted,
            is_deactivated
          )
        `,
        )
        .eq('following_id', userId)
        .order('created_at', { ascending: false });

      const { data: follows, error } = await query;

      if (error) {
        logger.error('Failed to get followers list', { module: 'FollowService', error });
        throw new BadRequestException('Failed to get followers list');
      }

      // Process follows - extract the user from the array and filter out deleted/deactivated
      const processedFollows = (follows || [])
        .map((follow: any) => {
          const user = follow.follower?.[0] || follow.follower || {};
          let affinityTags: string[] = [];
          if (user.affinity_tags_encrypted) {
            try {
              const decrypted = this.decryptField(user.affinity_tags_encrypted);
              affinityTags = decrypted ? JSON.parse(decrypted) : [];
            } catch {
              try { affinityTags = JSON.parse(user.affinity_tags_encrypted); } catch { affinityTags = []; }
            }
          }
          return {
            id: follow.id,
            created_at: follow.created_at,
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              job_title: user.job_title,
              company_type: user.company_type,
              mentoring_as: user.mentoring_as,
              is_willing_to_mentor: user.is_willing_to_mentor,
              mentor_bio: user.mentor_bio,
              location: user.location,
              years_experience: user.years_experience,
              career_level: this.decryptField(user.career_level_encrypted),
              affinity_tags: affinityTags,
              first_name_encrypted: user.first_name_encrypted,
              last_name_encrypted: user.last_name_encrypted,
              has_completed_onboarding: user.has_completed_onboarding,
              is_deleted: user.is_deleted,
              is_deactivated: user.is_deactivated,
            },
          };
        })
        .filter((f) => !f.user.is_deleted && !f.user.is_deactivated && f.user.has_completed_onboarding !== false);

      // Filter by type if specified
      let filteredFollows = processedFollows;
      if (type === 'mentors') {
        filteredFollows = processedFollows.filter((f) => {
          const user = f.user;
          return (
            user.is_willing_to_mentor ||
            user.mentoring_as === 'mentor' ||
            user.mentoring_as === 'both'
          );
        });
      } else if (type === 'mentees') {
        filteredFollows = processedFollows.filter((f) => {
          const user = f.user;
          return user.mentoring_as === 'mentee' || user.mentoring_as === 'both';
        });
      }

      // Apply identity reveal — show real name for revealed users and self
      const viewerId = currentUserId || userId;
      const otherUserIds = filteredFollows
        .filter((f) => f.user.id && f.user.id !== viewerId)
        .map((f) => f.user.id);
      const revealedIds = await this.identityReveal.getRevealedUserIds(viewerId, otherUserIds);

      return {
        success: true,
        message: 'Followers list retrieved successfully',
        data: {
          followers: filteredFollows.map((f) => {
            const isOwnEntry = f.user.id === viewerId;
            const isRevealed = revealedIds.has(f.user.id);
            let displayName = f.user.username;
            if (isOwnEntry || isRevealed) {
              const realName = this.identityReveal.decryptRealName(
                f.user.first_name_encrypted,
                f.user.last_name_encrypted,
              );
              if (realName) displayName = realName;
            }
            const { first_name_encrypted, last_name_encrypted, ...userWithout } = f.user;
            return {
              ...userWithout,
              display_name: displayName,
              followId: f.id,
              followedAt: f.created_at,
            };
          }),
          total: filteredFollows.length,
        },
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to get followers list', { module: 'FollowService', error });
      throw new BadRequestException('Failed to get followers list');
    }
  }

  async checkFollowStatus(followerId: string, followingId: string) {
    try {
      // Check both directions in parallel
      const [
        { data: iFollow, error: iFollowError },
        { data: theyFollowMe, error: theyFollowError },
      ] = await Promise.all([
        this.admin
          .from('user_follows')
          .select('id, created_at')
          .eq('follower_id', followerId)
          .eq('following_id', followingId)
          .maybeSingle(),
        this.admin
          .from('user_follows')
          .select('id, created_at')
          .eq('follower_id', followingId)
          .eq('following_id', followerId)
          .maybeSingle(),
      ]);

      if (iFollowError || theyFollowError) {
        return {
          success: true,
          message: 'Follow status retrieved',
          data: {
            isFollowing: false,
            isFollowedBy: false,
          },
        };
      }

      return {
        success: true,
        message: 'Follow status retrieved',
        data: {
          isFollowing: !!iFollow,
          followId: iFollow?.id,
          followedAt: iFollow?.created_at,
          isFollowedBy: !!theyFollowMe,
          followedByAt: theyFollowMe?.created_at,
        },
      };
    } catch (error: any) {
      logger.error('Failed to check follow status', { module: 'FollowService', error });
      return {
        success: false,
        message: 'Failed to check follow status',
        data: {
          isFollowing: false,
          isFollowedBy: false,
        },
      };
    }
  }

  private async createNotification(
    userId: string,
    actorId: string,
    type: string,
    title: string,
    message: string,
    actionUrl: string,
    referenceId: string,
    referenceType: string,
  ) {
    try {
      await this.notificationsService.createNotification({
        user_id: userId,
        actor_id: actorId,
        type,
        title,
        message,
        action_url: actionUrl,
        reference_id: referenceId,
        reference_type: referenceType,
        metadata: {},
        delivery_method: ['in_app'],
      });
    } catch (error: any) {
      logger.error('Failed to create follow notification', { module: 'FollowService', error });
    }
  }
}
