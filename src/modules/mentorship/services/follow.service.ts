import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

interface FollowWithUser {
  id: string;
  created_at: string;
  following: Array<{
    id: string;
    username: string;
    avatar: string;
    job_title: string | null;
    company_type: string | null;
    mentoring_as: string | null;
    is_willing_to_mentor: boolean;
    mentor_bio: string | null;
    location: string | null;
    years_experience: number | null;
    career_level_encrypted: string | null;
  }>;
}

interface FollowerWithUser {
  id: string;
  created_at: string;
  follower: Array<{
    id: string;
    username: string;
    avatar: string;
    job_title: string | null;
    company_type: string | null;
    mentoring_as: string | null;
    is_willing_to_mentor: boolean;
    mentor_bio: string | null;
    location: string | null;
    years_experience: number | null;
    career_level_encrypted: string | null;
  }>;
}

@Injectable()
export class FollowService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async followUser(followerId: string, followingId: string) {
    try {
      console.log(
        `Attempting to follow: follower=${followerId}, following=${followingId}`,
      );

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

      // Log errors for debugging
      if (followerError) {
        console.error('Follower query error:', followerError);
      }
      if (followingError) {
        console.error('Following query error:', followingError);
      }

      if (!follower) {
        console.error(`Follower not found: ${followerId}`);
        throw new NotFoundException('Follower user not found');
      }

      if (!following) {
        console.error(`Following user not found: ${followingId}`);
        throw new NotFoundException('User to follow not found');
      }

      if (followerId === followingId) {
        throw new BadRequestException('Cannot follow yourself');
      }

      // Check if already following - use maybeSingle to avoid throwing error if not found
      const { data: existingFollow, error: existingFollowError } =
        await this.admin
          .from('user_follows')
          .select('id')
          .eq('follower_id', followerId)
          .eq('following_id', followingId)
          .maybeSingle();

      if (existingFollowError) {
        console.error('Existing follow check error:', existingFollowError);
      }

      if (existingFollow) {
        console.log(
          `Already following: follower=${followerId}, following=${followingId}`,
        );
        throw new BadRequestException('Already following this user');
      }

      // Create follow relationship - Generate UUID for id
      const { v4: uuidv4 } = require('uuid');
      const followId = uuidv4();

      const { data: follow, error: followError } = await this.admin
        .from('user_follows')
        .insert({
          id: followId, // Add the generated UUID
          follower_id: followerId,
          following_id: followingId,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (followError) {
        console.error('Follow creation error:', followError);
        throw new BadRequestException(
          `Failed to follow user: ${followError.message}`,
        );
      }

      console.log(`Successfully followed: ${follow.id}`);

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
      console.error('Follow user error:', error);
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
      console.log(
        `Attempting to unfollow: follower=${followerId}, following=${followingId}`,
      );

      const { error, count } = await this.admin
        .from('user_follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

      if (error) {
        console.error('Unfollow error:', error);
        throw new BadRequestException(
          `Failed to unfollow user: ${error.message}`,
        );
      }

      console.log(`Successfully unfollowed, rows affected: ${count}`);

      return {
        success: true,
        message: 'Successfully unfollowed user',
        data: {},
      };
    } catch (error: any) {
      console.error('Unfollow user error:', error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to unfollow user: ${errorMessage}`);
    }
  }

  async getFollowing(userId: string, type?: string) {
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
            career_level_encrypted
          )
        `,
        )
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });

      const { data: follows, error } = await query;

      if (error) {
        console.error('Get following error:', error);
        throw new BadRequestException('Failed to get following list');
      }

      // Process follows - extract the user from the array
      const processedFollows = (follows || []).map((follow: any) => {
        const user = follow.following?.[0] || follow.following || {};
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
            career_level: user.career_level_encrypted,
          },
        };
      });

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

      return {
        success: true,
        message: 'Following list retrieved successfully',
        data: {
          following: filteredFollows.map((f) => ({
            ...f.user,
            followId: f.id,
            followedAt: f.created_at,
          })),
          total: filteredFollows.length,
        },
      };
    } catch (error: any) {
      console.error('Get following error:', error);
      throw new BadRequestException('Failed to get following list');
    }
  }

  async getFollowers(userId: string, type?: string) {
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
            career_level_encrypted
          )
        `,
        )
        .eq('following_id', userId)
        .order('created_at', { ascending: false });

      const { data: follows, error } = await query;

      if (error) {
        console.error('Get followers error:', error);
        throw new BadRequestException('Failed to get followers list');
      }

      // Process follows - extract the user from the array
      const processedFollows = (follows || []).map((follow: any) => {
        const user = follow.follower?.[0] || follow.follower || {};
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
            career_level: user.career_level_encrypted,
          },
        };
      });

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

      return {
        success: true,
        message: 'Followers list retrieved successfully',
        data: {
          followers: filteredFollows.map((f) => ({
            ...f.user,
            followId: f.id,
            followedAt: f.created_at,
          })),
          total: filteredFollows.length,
        },
      };
    } catch (error: any) {
      console.error('Get followers error:', error);
      throw new BadRequestException('Failed to get followers list');
    }
  }

  async checkFollowStatus(followerId: string, followingId: string) {
    try {
      console.log(
        `Checking follow status: follower=${followerId}, following=${followingId}`,
      );

      const { data: follow, error } = await this.admin
        .from('user_follows')
        .select('id, created_at')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

      if (error) {
        console.error('Follow status check error:', error);
        // Don't throw, just return false
        return {
          success: true,
          message: 'Follow status retrieved',
          data: {
            isFollowing: false,
            followId: null,
            followedAt: null,
          },
        };
      }

      return {
        success: true,
        message: 'Follow status retrieved',
        data: {
          isFollowing: !!follow,
          followId: follow?.id,
          followedAt: follow?.created_at,
        },
      };
    } catch (error: any) {
      console.error('Check follow status error:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to check follow status: ${errorMessage}`,
        data: {
          isFollowing: false,
          followId: null,
          followedAt: null,
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
      const { v4: uuidv4 } = require('uuid');
      const notificationId = uuidv4();

      const { error } = await this.admin.from('notifications').insert({
        id: notificationId,
        user_id: userId,
        actor_id: actorId,
        type,
        title,
        message,
        action_url: actionUrl,
        reference_id: referenceId,
        reference_type: referenceType,
        metadata: {},
        created_at: new Date().toISOString(),
        read: false,
      });

      if (error) {
        console.error('Failed to create notification:', error);
      } else {
        console.log('Notification created successfully');
      }
    } catch (error: any) {
      console.error('Failed to create notification:', error);
    }
  }
}
