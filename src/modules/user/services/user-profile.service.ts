import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';

@Injectable()
export class UserProfileService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ============ PROFILE MANAGEMENT ============

  async getUserProfileById(userId: string, currentUserId?: string) {
    logger.info('Fetching user profile', { userId });

    const isOwnProfile = currentUserId === userId;

    try {
      const { data: profile, error } = await this.admin
        .from('user_profiles')
        .select(
          `
          id,
          username,
          avatar,
          bio,
          job_title,
          location,
          skills,
          linkedin_url,
          badges,
          created_at,
          career_level_encrypted,
          company_encrypted,
          affinity_tags_encrypted,
          first_name_encrypted,
          last_name_encrypted,
          total_posts,
          total_comments,
          helpful_votes_received,
          reputation_score,
          is_willing_to_mentor,
          mentor_bio,
          mentor_expertise,
          mentor_style,
          mentor_availability,
          is_deleted,
          is_deactivated,
          profile_visibility,
          show_company,
          show_location,
          show_activity,
          show_connections
        `,
        )
        .eq('id', userId)
        .single();

      if (error || !profile) {
        throw new NotFoundException('User not found');
      }

      // Hide soft-deleted or deactivated profiles
      if ((profile as any).is_deleted || (profile as any).is_deactivated) {
        throw new NotFoundException('User not found');
      }

      // Block check — if either user has blocked the other, hide profile
      if (!isOwnProfile && currentUserId) {
        const { data: block } = await this.admin
          .from('user_blocks')
          .select('id')
          .or(
            `and(blocker_id.eq.${currentUserId},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${currentUserId})`,
          )
          .maybeSingle();

        if (block) {
          throw new NotFoundException('User not found');
        }
      }

      // Check if current user follows this user
      let isFollowing = false;
      if (currentUserId && !isOwnProfile) {
        const { data: followData } = await this.admin
          .from('user_follows')
          .select('id')
          .eq('follower_id', currentUserId)
          .eq('following_id', userId)
          .maybeSingle();

        isFollowing = !!followData;
      }

      // Enforce profile_visibility for non-own profiles
      if (!isOwnProfile) {
        const visibility = (profile as any).profile_visibility || 'public';

        if (visibility === 'private') {
          throw new ForbiddenException('This profile is private');
        }

        if (visibility === 'connections' && !isFollowing) {
          // Return minimal profile for non-connections
          return {
            success: true,
            data: {
              id: profile.id,
              username: profile.username,
              avatar: profile.avatar,
              bio: null,
              isFollowing: false,
              profileVisibility: 'connections',
              message: 'Follow this user to see their full profile',
            },
          };
        }
      }

      // Resolve display_name via identity reveal
      let displayName = profile.username;
      if (!isOwnProfile && currentUserId) {
        const revealed = await this.identityReveal.isRevealed(currentUserId, userId);
        if (revealed) {
          const realName = this.identityReveal.decryptRealName(
            (profile as any).first_name_encrypted,
            (profile as any).last_name_encrypted,
          );
          if (realName) displayName = realName;
        }
      } else if (isOwnProfile) {
        // Own profile — show real name if available
        const realName = this.identityReveal.decryptRealName(
          (profile as any).first_name_encrypted,
          (profile as any).last_name_encrypted,
        );
        if (realName) displayName = realName;
      }

      // Build response
      const response: any = {
        id: profile.id,
        username: profile.username,
        display_name: displayName,
        avatar: profile.avatar,
        bio: profile.bio,
        jobTitle: profile.job_title,
        skills: profile.skills,
        linkedinUrl: profile.linkedin_url,
        badges: profile.badges,
        joinedDate: profile.created_at,
        isFollowing,
      };

      // Enforce field-level privacy for non-own profiles
      const showLocation = isOwnProfile || (profile as any).show_location !== false;
      const showCompany = isOwnProfile || (profile as any).show_company !== false;
      const showActivity = isOwnProfile || (profile as any).show_activity !== false;

      if (showLocation) {
        response.location = profile.location;
      }

      // Stats — only if show_activity is on (use live counts)
      if (showActivity) {
        const statsResult = await this.getUserStats(userId);
        response.stats = {
          postsCreated: statsResult.data.postsCreated,
          commentsPosted: statsResult.data.commentsPosted,
          helpfulReactions: statsResult.data.helpfulReactions,
          reputationScore: statsResult.data.reputationScore,
        };
      }

      // Add decrypted demographics
      if (profile.career_level_encrypted) {
        response.careerLevel = this.encryption.decrypt(profile.career_level_encrypted);
      }
      if (showCompany && profile.company_encrypted) {
        response.company = this.encryption.decrypt(profile.company_encrypted);
      }
      if (profile.affinity_tags_encrypted) {
        try {
          response.affinityTags = JSON.parse(
            this.encryption.decrypt(profile.affinity_tags_encrypted),
          );
        } catch (e) {
          response.affinityTags = [];
        }
      }

      // Add mentor profile if available
      if (profile.is_willing_to_mentor) {
        response.mentorProfile = {
          expertise: profile.mentor_expertise || [],
          style: profile.mentor_style,
          availability: profile.mentor_availability,
          bio: profile.mentor_bio,
        };
      }

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      logger.error('Failed to fetch user profile', { error });
      throw new BadRequestException('Failed to fetch user profile');
    }
  }

  async updateAvatar(userId: string, avatar: string) {
    logger.info('Updating avatar', { userId });

    try {
      const { data, error } = await this.admin
        .from('user_profiles')
        .update({ avatar, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('avatar')
        .single();

      if (error) {
        throw new BadRequestException('Failed to update avatar');
      }

      return {
        success: true,
        data: { avatar: data.avatar },
        message: 'Avatar updated successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to update avatar', { error });
      throw new BadRequestException('Failed to update avatar');
    }
  }

  async updateUsername(userId: string, username: string) {
    logger.info('Updating username', { userId, username });

    try {
      // Check if username is already taken
      const { data: existing } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existing && existing.id !== userId) {
        throw new BadRequestException('Username already taken');
      }

      const { data, error } = await this.admin
        .from('user_profiles')
        .update({ username, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('username')
        .single();

      if (error) {
        throw new BadRequestException('Failed to update username');
      }

      return {
        success: true,
        data: { username: data.username },
        message: 'Username updated successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Failed to update username', { error });
      throw new BadRequestException('Failed to update username');
    }
  }

  // ============ STATISTICS ============

  async getUserStats(userId: string) {
    logger.info('Fetching user stats', { userId });

    try {
      // Verify user exists and get mentorship_sessions_completed (actually updated by app)
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('id, mentorship_sessions_completed')
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new NotFoundException('User not found');
      }

      // Run all COUNT queries in parallel for actual stats
      const [
        feedPostsResult,
        referralPostsResult,
        forumCommentsResult,
        feedCommentsResult,
        referralCommentsResult,
        topicsResult,
        nooksResult,
        // Sum likes_count from user's own content (these are maintained by existing RPCs)
        feedPostLikesResult,
        topicReactionsResult,
        referralLikesResult,
        // Referrals made & followers
        referralsMadeResult,
        followersResult,
      ] = await Promise.all([
        // Posts created
        this.admin.from('feed_posts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_archived', false),
        this.admin.from('referral_posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        // Comments posted
        this.admin.from('forum_comments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        this.admin.from('feed_comments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        this.admin.from('referral_comments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        // Topics and nooks
        this.admin.from('forum_topics').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        this.admin.from('nook_members').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        // Likes/reactions received — sum from user's own content rows
        this.admin.from('feed_posts').select('likes_count').eq('user_id', userId).eq('is_archived', false),
        this.admin.from('forum_topics').select('reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count').eq('user_id', userId),
        this.admin.from('referral_posts').select('likes_count').eq('user_id', userId),
        // Successful referrals (accepted connections where user is the requester or post owner)
        this.admin.from('referral_connections').select('*', { count: 'exact', head: true }).eq('requester_id', userId).eq('status', 'accepted'),
        // Followers
        this.admin.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      ]);

      const postsCreated = (feedPostsResult.count || 0) + (referralPostsResult.count || 0);
      const commentsPosted = (forumCommentsResult.count || 0) + (feedCommentsResult.count || 0) + (referralCommentsResult.count || 0);
      const topicsCreated = topicsResult.count || 0;
      const nooksJoined = nooksResult.count || 0;
      const mentorshipSessions = profile.mentorship_sessions_completed || 0;
      const referralsMade = referralsMadeResult.count || 0;
      const followersCount = followersResult.count || 0;

      // Sum likes_count from user's feed posts
      const feedLikesTotal = (feedPostLikesResult.data || []).reduce(
        (sum: number, p: any) => sum + (p.likes_count || 0), 0,
      );
      // Sum all topic reaction types
      const topicReactionsTotal = (topicReactionsResult.data || []).reduce(
        (sum: number, t: any) => sum + (t.reaction_seen_count || 0) + (t.reaction_validated_count || 0) + (t.reaction_inspired_count || 0) + (t.reaction_heard_count || 0), 0,
      );
      // Sum referral likes
      const referralLikesTotal = (referralLikesResult.data || []).reduce(
        (sum: number, p: any) => sum + (p.likes_count || 0), 0,
      );
      const helpfulReactions = feedLikesTotal + topicReactionsTotal + referralLikesTotal;

      // Reputation score = weighted combination of activity
      const reputationScore =
        (postsCreated * 5) +
        (commentsPosted * 2) +
        (topicsCreated * 5) +
        (helpfulReactions * 3) +
        (mentorshipSessions * 10) +
        (referralsMade * 15) +
        (followersCount * 2);

      return {
        success: true,
        data: {
          postsCreated,
          commentsPosted,
          helpfulReactions,
          reputationScore,
          topicsCreated,
          nooksJoined,
          mentorshipSessions,
          referralsMade,
          followersCount,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to fetch user stats', { error });
      throw new BadRequestException('Failed to fetch user stats');
    }
  }

  async getUserBadges(userId: string) {
    logger.info('Fetching user badges', { userId });

    try {
      // Get live stats to determine earned badges
      const statsResult = await this.getUserStats(userId);
      const stats = statsResult.data;

      // Define all badges with their unlock conditions
      const allBadges = [
        {
          id: 'first_post',
          name: 'First Post',
          description: 'Created your first post',
          icon: '✍️',
          earned: stats.postsCreated >= 1,
        },
        {
          id: 'first_comment',
          name: 'First Comment',
          description: 'Posted your first comment',
          icon: '💬',
          earned: stats.commentsPosted >= 1,
        },
        {
          id: 'first_topic',
          name: 'Conversation Starter',
          description: 'Created your first forum topic',
          icon: '🗣️',
          earned: stats.topicsCreated >= 1,
        },
        {
          id: 'active_contributor',
          name: 'Active Contributor',
          description: 'Posted 50+ times',
          icon: '⭐',
          earned: stats.postsCreated >= 50,
        },
        {
          id: 'prolific_writer',
          name: 'Prolific Writer',
          description: 'Created 10+ forum topics',
          icon: '📝',
          earned: stats.topicsCreated >= 10,
        },
        {
          id: 'helpful_10',
          name: 'Helping Hand',
          description: 'Received 10 reactions on your content',
          icon: '👏',
          earned: stats.helpfulReactions >= 10,
        },
        {
          id: 'helpful_100',
          name: 'Helpful Helper',
          description: 'Received 100 reactions on your content',
          icon: '🤝',
          earned: stats.helpfulReactions >= 100,
        },
        {
          id: 'mentor',
          name: 'Mentor',
          description: 'Completed 10+ mentorship sessions',
          icon: '🎓',
          earned: stats.mentorshipSessions >= 10,
        },
        {
          id: 'first_mentorship',
          name: 'Mentorship Begun',
          description: 'Completed your first mentorship session',
          icon: '🤝',
          earned: stats.mentorshipSessions >= 1,
        },
        {
          id: 'referral_maker',
          name: 'Connector',
          description: 'Made a successful referral connection',
          icon: '🔗',
          earned: stats.referralsMade >= 1,
        },
        {
          id: 'referral_pro',
          name: 'Referral Pro',
          description: 'Made 10+ successful referral connections',
          icon: '🌟',
          earned: stats.referralsMade >= 10,
        },
        {
          id: 'community_member',
          name: 'Community Member',
          description: 'Joined your first nook',
          icon: '🏠',
          earned: stats.nooksJoined >= 1,
        },
        {
          id: 'social_butterfly',
          name: 'Social Butterfly',
          description: 'Gained 10+ followers',
          icon: '🦋',
          earned: stats.followersCount >= 10,
        },
        {
          id: 'rising_star',
          name: 'Rising Star',
          description: 'Reached 100 reputation score',
          icon: '🚀',
          earned: stats.reputationScore >= 100,
        },
      ];

      // Sync earned badges to user_profiles.badges column
      const newEarnedIds = allBadges.filter((b) => b.earned).map((b) => b.id);
      const { data: currentProfile } = await this.admin
        .from('user_profiles')
        .select('badges')
        .eq('id', userId)
        .single();

      const currentBadges = currentProfile?.badges || [];
      const hasNewBadges = newEarnedIds.some((id) => !currentBadges.includes(id));
      if (hasNewBadges) {
        await this.admin
          .from('user_profiles')
          .update({ badges: newEarnedIds })
          .eq('id', userId);
      }

      return {
        success: true,
        data: {
          badges: allBadges,
          earnedCount: newEarnedIds.length,
          totalCount: allBadges.length,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to fetch user badges', { error });
      throw new BadRequestException('Failed to fetch user badges');
    }
  }

  async getUserActivity(
    userId: string,
    type: 'posts' | 'comments' | 'topics' | 'nooks' | 'all' = 'all',
    page: number = 1,
    limit: number = 20,
  ) {
    logger.info('Fetching user activity', { userId, type, page, limit });

    const offset = (page - 1) * limit;
    const activities: any[] = [];

    try {
      if (type === 'posts' || type === 'all') {
        const { data: posts } = await this.admin
          .from('feed_posts')
          .select('id, content, created_at, likes_count, comments_count')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(type === 'all' ? 5 : limit)
          .range(offset, offset + limit - 1);

        activities.push(
          ...(posts || []).map((p) => ({
            type: 'post',
            id: p.id,
            content: p.content,
            createdAt: p.created_at,
            engagement: { likes: p.likes_count, comments: p.comments_count },
          })),
        );
      }

      if (type === 'topics' || type === 'all') {
        const { data: topics } = await this.admin
          .from('forum_topics')
          .select('id, title, created_at, comments_count')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(type === 'all' ? 5 : limit)
          .range(offset, offset + limit - 1);

        activities.push(
          ...(topics || []).map((t) => ({
            type: 'topic',
            id: t.id,
            content: t.title,
            createdAt: t.created_at,
            engagement: { comments: t.comments_count },
          })),
        );
      }

      if (type === 'comments' || type === 'all') {
        const { data: comments } = await this.admin
          .from('forum_comments')
          .select('id, content, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false})
          .limit(type === 'all' ? 5 : limit)
          .range(offset, offset + limit - 1);

        activities.push(
          ...(comments || []).map((c) => ({
            type: 'comment',
            id: c.id,
            content: c.content,
            createdAt: c.created_at,
          })),
        );
      }

      // Sort all activities by date
      activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return {
        success: true,
        data: activities.slice(0, limit),
        pagination: {
          page,
          limit,
          hasMore: activities.length > limit,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch user activity', { error });
      throw new BadRequestException('Failed to fetch user activity');
    }
  }
}
