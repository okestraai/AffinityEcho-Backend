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
          show_connections,
          years_experience,
          is_company_verified
        `,
        )
        .eq('id', userId)
        .single();

      if (error || !profile) {
        throw new NotFoundException('User not found');
      }

      // Hide soft-deleted or deactivated profiles
      if (profile.is_deleted || profile.is_deactivated) {
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

      // Check follow status and get follower/following counts in parallel
      let isFollowing = false;
      let isFollowedBy = false;
      let followersCount = 0;
      let followingCount = 0;

      const [followersResult, followingResult] = await Promise.all([
        this.admin
          .from('user_follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', userId),
        this.admin
          .from('user_follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', userId),
      ]);
      followersCount = followersResult.count || 0;
      followingCount = followingResult.count || 0;

      if (currentUserId && !isOwnProfile) {
        const [iFollowResult, theyFollowResult] = await Promise.all([
          this.admin
            .from('user_follows')
            .select('id')
            .eq('follower_id', currentUserId)
            .eq('following_id', userId)
            .maybeSingle(),
          this.admin
            .from('user_follows')
            .select('id')
            .eq('follower_id', userId)
            .eq('following_id', currentUserId)
            .maybeSingle(),
        ]);
        isFollowing = !!iFollowResult.data;
        isFollowedBy = !!theyFollowResult.data;
      }

      // Enforce profile_visibility for non-own profiles
      if (!isOwnProfile) {
        const visibility = profile.profile_visibility || 'public';

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
        const revealed = await this.identityReveal.isRevealed(
          currentUserId,
          userId,
        );
        if (revealed) {
          const realName = this.identityReveal.decryptRealName(
            profile.first_name_encrypted,
            profile.last_name_encrypted,
          );
          if (realName) displayName = realName;
        }
      } else if (isOwnProfile) {
        // Own profile — show real name if available
        const realName = this.identityReveal.decryptRealName(
          profile.first_name_encrypted,
          profile.last_name_encrypted,
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
        job_title: profile.job_title,
        years_experience: profile.years_experience ?? null,
        skills: profile.skills,
        linkedinUrl: profile.linkedin_url,
        badges: profile.badges,
        joinedDate: profile.created_at,
        isFollowing,
        isFollowedBy: isOwnProfile ? undefined : isFollowedBy,
        followersCount,
        followingCount,
        is_company_verified: profile.is_company_verified || false,
      };

      // Enforce field-level privacy for non-own profiles
      const showLocation = isOwnProfile || profile.show_location !== false;
      const showCompany = isOwnProfile || profile.show_company !== false;
      const showActivity = isOwnProfile || profile.show_activity !== false;

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

      // Add decrypted demographics — own profile only (career/company are sensitive)
      if (isOwnProfile) {
        if (profile.career_level_encrypted) {
          response.careerLevel = this.encryption.decrypt(
            profile.career_level_encrypted,
          );
        }
        if (profile.company_encrypted) {
          response.company = this.encryption.decrypt(profile.company_encrypted);
        }
      }

      // Affinity groups — visible to all users (community tags, not sensitive)
      if (profile.affinity_tags_encrypted) {
        try {
          const decrypted = this.encryption.decrypt(
            profile.affinity_tags_encrypted,
          );
          response.affinityTags = JSON.parse(decrypted);
        } catch {
          try {
            response.affinityTags = JSON.parse(profile.affinity_tags_encrypted);
          } catch {
            response.affinityTags = [];
          }
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
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error('Failed to fetch user profile', { error });
      throw new BadRequestException('Failed to fetch user profile');
    }
  }

  /**
   * Full user profile — single endpoint combining profile, stats, recent content,
   * identity reveal status, and the viewer's engagement with this user.
   * Badges are excluded for non-own profiles.
   */
  async getFullUserProfile(targetUserId: string, currentUserId: string) {
    const isOwnProfile = currentUserId === targetUserId;

    // Base profile (handles privacy, blocks, and visibility checks)
    const baseResult = await this.getUserProfileById(
      targetUserId,
      currentUserId,
    );
    const now = new Date().toISOString();

    const [
      { data: recentPosts },
      { data: recentTopics },
      { data: recentNooks },
      { data: recentComments },
      identityRevealed,
      viewerEngagement,
      { data: encryptedNameFields },
    ] = await Promise.all([
      this.admin
        .from('feed_posts')
        .select(
          'id, content, tags, likes_count, comments_count, shares_count, views_count, created_at, is_anonymous',
        )
        .eq('user_id', targetUserId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(5),

      this.admin
        .from('forum_topics')
        .select(
          'id, title, content, tags, scope, comments_count, reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count, created_at, is_anonymous, forum:forums(id, name)',
        )
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(5),

      this.admin
        .from('nooks')
        .select(
          'id, title, description, urgency, scope, temperature, hashtags, members_count, messages_count, expires_at, created_at',
        )
        .eq('creator_id', targetUserId)
        .eq('is_active', true)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(5),

      this.admin
        .from('feed_comments')
        .select(
          'id, content_type, content_id, content, is_anonymous, created_at',
        )
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(5),

      isOwnProfile
        ? Promise.resolve(false)
        : this.identityReveal.isRevealed(currentUserId, targetUserId),

      isOwnProfile
        ? Promise.resolve(null)
        : this.getViewerEngagementSummary(currentUserId, targetUserId),

      this.admin
        .from('user_profiles')
        .select('first_name_encrypted, last_name_encrypted')
        .eq('id', targetUserId)
        .single(),
    ]);

    const formattedPosts = (recentPosts || []).map((p: any) => ({
      id: p.id,
      content_id: p.id,
      content_type: 'post' as const,
      is_anonymous: p.is_anonymous,
      content: { text: p.content, tags: p.tags },
      engagement: {
        likes: p.likes_count,
        comments: p.comments_count,
        shares: p.shares_count,
        views: p.views_count,
      },
      reaction_counts: { heard: 0, validated: 0, inspired: 0 },
      user_liked: false,
      user_bookmarked: false,
      user_reactions: { heard: false, validated: false, inspired: false },
      created_at: p.created_at,
    }));

    const formattedTopics = (recentTopics || []).map((t: any) => {
      const totalReactions =
        (t.reaction_seen_count || 0) +
        (t.reaction_validated_count || 0) +
        (t.reaction_inspired_count || 0) +
        (t.reaction_heard_count || 0);
      return {
        id: t.id,
        content_id: t.id,
        content_type: 'topic' as const,
        is_anonymous: t.is_anonymous,
        content: {
          title: t.title,
          text: t.content,
          forum_name: t.forum?.name || null,
          tags: t.tags,
        },
        engagement: { likes: totalReactions, comments: t.comments_count },
        reaction_counts: {
          seen: t.reaction_seen_count || 0,
          validated: t.reaction_validated_count || 0,
          inspired: t.reaction_inspired_count || 0,
          heard: t.reaction_heard_count || 0,
        },
        user_liked: false,
        user_bookmarked: false,
        user_reactions: {
          seen: false,
          validated: false,
          inspired: false,
          heard: false,
        },
        created_at: t.created_at,
      };
    });

    const formattedNooks = (recentNooks || []).map((n: any) => ({
      id: n.id,
      content_type: 'nook' as const,
      content: {
        title: n.title,
        text: n.description,
        urgency: n.urgency || 'medium',
        scope: n.scope || 'company',
        temperature: n.temperature || 'cool',
        hashtags: n.hashtags || [],
      },
      engagement: {
        members: n.members_count || 0,
        messages: n.messages_count || 0,
      },
      members_count: n.members_count || 0,
      messages_count: n.messages_count || 0,
      expires_at: n.expires_at,
      time_left: this.calculateTimeLeft(n.expires_at),
      created_at: n.created_at,
    }));

    const formattedComments = (recentComments || []).map((c: any) => ({
      id: c.id,
      content_type: c.content_type,
      content_id: c.content_id,
      is_anonymous: c.is_anonymous,
      content: c.content,
      created_at: c.created_at,
    }));

    // Enrich posts and topics with viewer's per-item reaction/like/bookmark state
    if (!isOwnProfile) {
      await this.enrichProfileActivityItems(
        currentUserId,
        formattedPosts,
        formattedTopics,
      );
    }

    // Inject real name when identity is revealed between viewer and viewee
    if ((identityRevealed || isOwnProfile) && encryptedNameFields) {
      const fullName = this.identityReveal.decryptRealName(
        encryptedNameFields.first_name_encrypted,
        encryptedNameFields.last_name_encrypted,
      );
      if (fullName) {
        baseResult.data.full_name = fullName;
      }
    }

    return {
      success: true,
      data: {
        profile: baseResult.data,
        identity_revealed: identityRevealed,
        recent_activity: {
          posts: formattedPosts,
          topics: formattedTopics,
          nooks: formattedNooks,
          comments: formattedComments,
        },
        viewer_engagement: viewerEngagement,
      },
    };
  }

  private async enrichProfileActivityItems(
    viewerId: string,
    posts: any[],
    topics: any[],
  ): Promise<void> {
    const postIds = posts.map((p) => p.content_id);
    const topicIds = topics.map((t) => t.content_id);
    const allIds = [...postIds, ...topicIds];
    if (allIds.length === 0) return;

    const [
      { data: likes },
      { data: bookmarks },
      { data: feedUserReactions },
      { data: feedAllReactions },
      { data: topicUserReactions },
    ] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('content_id')
        .eq('user_id', viewerId)
        .in('content_id', allIds),
      this.admin
        .from('feed_bookmarks')
        .select('content_id')
        .eq('user_id', viewerId)
        .in('content_id', allIds),
      postIds.length > 0
        ? this.admin
            .from('feed_reactions')
            .select('content_id, reaction_type')
            .eq('user_id', viewerId)
            .in('content_id', postIds)
        : Promise.resolve({ data: [] }),
      postIds.length > 0
        ? this.admin
            .from('feed_reactions')
            .select('content_id, reaction_type')
            .in('content_id', postIds)
        : Promise.resolve({ data: [] }),
      topicIds.length > 0
        ? this.admin
            .from('topic_reactions')
            .select('topic_id, reaction_type')
            .eq('user_id', viewerId)
            .in('topic_id', topicIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likeSet = new Set((likes || []).map((l: any) => l.content_id));
    const bookmarkSet = new Set(
      (bookmarks || []).map((b: any) => b.content_id),
    );

    const feedUserReactionMap = new Map<string, Set<string>>();
    (feedUserReactions || []).forEach((r: any) => {
      if (!feedUserReactionMap.has(r.content_id))
        feedUserReactionMap.set(r.content_id, new Set());
      feedUserReactionMap.get(r.content_id)!.add(r.reaction_type);
    });

    const feedReactionCounts = new Map<string, Record<string, number>>();
    (feedAllReactions || []).forEach((r: any) => {
      if (!feedReactionCounts.has(r.content_id))
        feedReactionCounts.set(r.content_id, {
          heard: 0,
          validated: 0,
          inspired: 0,
        });
      const counts = feedReactionCounts.get(r.content_id)!;
      if (counts[r.reaction_type] !== undefined) counts[r.reaction_type]++;
    });

    const topicUserReactionMap = new Map<string, Set<string>>();
    (topicUserReactions || []).forEach((r: any) => {
      if (!topicUserReactionMap.has(r.topic_id))
        topicUserReactionMap.set(r.topic_id, new Set());
      topicUserReactionMap.get(r.topic_id)!.add(r.reaction_type);
    });

    posts.forEach((p) => {
      const id = p.content_id;
      const reactions = feedUserReactionMap.get(id);
      p.user_liked = likeSet.has(id);
      p.user_bookmarked = bookmarkSet.has(id);
      p.user_reactions = {
        heard: reactions?.has('heard') || false,
        validated: reactions?.has('validated') || false,
        inspired: reactions?.has('inspired') || false,
      };
      p.reaction_counts = feedReactionCounts.get(id) || {
        heard: 0,
        validated: 0,
        inspired: 0,
      };
    });

    topics.forEach((t) => {
      const id = t.content_id;
      const reactions = topicUserReactionMap.get(id);
      t.user_liked = likeSet.has(id);
      t.user_bookmarked = bookmarkSet.has(id);
      t.user_reactions = {
        seen: reactions?.has('seen') || false,
        validated: reactions?.has('validated') || false,
        inspired: reactions?.has('inspired') || false,
        heard: reactions?.has('heard') || false,
      };
    });
  }

  private async getViewerEngagementSummary(
    viewerId: string,
    targetUserId: string,
  ): Promise<any> {
    const [{ data: posts }, { data: topics }] = await Promise.all([
      this.admin
        .from('feed_posts')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('is_archived', false)
        .limit(100),
      this.admin
        .from('forum_topics')
        .select('id')
        .eq('user_id', targetUserId)
        .limit(100),
    ]);

    const postIds = (posts || []).map((p: any) => p.id);
    const topicIds = (topics || []).map((t: any) => t.id);
    const allIds = [...postIds, ...topicIds];

    if (allIds.length === 0)
      return { liked_count: 0, commented_count: 0, reaction_count: 0 };

    const [likesResult, commentsResult, reactionsResult] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', viewerId)
        .in('content_id', allIds),
      this.admin
        .from('feed_comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', viewerId)
        .in('content_id', allIds),
      postIds.length > 0
        ? this.admin
            .from('feed_reactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', viewerId)
            .in('content_id', postIds)
        : Promise.resolve({ count: 0 }),
    ]);

    return {
      liked_count: likesResult.count || 0,
      commented_count: commentsResult.count || 0,
      reaction_count: reactionsResult.count || 0,
    };
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
        this.admin
          .from('feed_posts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_archived', false),
        this.admin
          .from('referral_posts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        // Comments posted
        this.admin
          .from('forum_comments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        this.admin
          .from('feed_comments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        this.admin
          .from('referral_comments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        // Topics and nooks
        this.admin
          .from('forum_topics')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        this.admin
          .from('nook_members')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
        // Likes/reactions received — sum from user's own content rows
        this.admin
          .from('feed_posts')
          .select('likes_count')
          .eq('user_id', userId)
          .eq('is_archived', false),
        this.admin
          .from('forum_topics')
          .select(
            'reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count',
          )
          .eq('user_id', userId),
        this.admin
          .from('referral_posts')
          .select('likes_count')
          .eq('user_id', userId),
        // Successful referrals (accepted connections where user is the requester or post owner)
        this.admin
          .from('referral_connections')
          .select('*', { count: 'exact', head: true })
          .eq('requester_id', userId)
          .eq('status', 'accepted'),
        // Followers
        this.admin
          .from('user_follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', userId),
      ]);

      const postsCreated =
        (feedPostsResult.count || 0) + (referralPostsResult.count || 0);
      const commentsPosted =
        (forumCommentsResult.count || 0) +
        (feedCommentsResult.count || 0) +
        (referralCommentsResult.count || 0);
      const topicsCreated = topicsResult.count || 0;
      const nooksJoined = nooksResult.count || 0;
      const mentorshipSessions = profile.mentorship_sessions_completed || 0;
      const referralsMade = referralsMadeResult.count || 0;
      const followersCount = followersResult.count || 0;

      // Sum likes_count from user's feed posts
      const feedLikesTotal = (feedPostLikesResult.data || []).reduce(
        (sum: number, p: any) => sum + (p.likes_count || 0),
        0,
      );
      // Sum all topic reaction types
      const topicReactionsTotal = (topicReactionsResult.data || []).reduce(
        (sum: number, t: any) =>
          sum +
          (t.reaction_seen_count || 0) +
          (t.reaction_validated_count || 0) +
          (t.reaction_inspired_count || 0) +
          (t.reaction_heard_count || 0),
        0,
      );
      // Sum referral likes
      const referralLikesTotal = (referralLikesResult.data || []).reduce(
        (sum: number, p: any) => sum + (p.likes_count || 0),
        0,
      );
      const helpfulReactions =
        feedLikesTotal + topicReactionsTotal + referralLikesTotal;

      // Reputation score = weighted combination of activity
      const reputationScore =
        postsCreated * 5 +
        commentsPosted * 2 +
        topicsCreated * 5 +
        helpfulReactions * 3 +
        mentorshipSessions * 10 +
        referralsMade * 15 +
        followersCount * 2;

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
      // Get stats + current badges in PARALLEL
      const [statsResult, { data: badgeProfile }] = await Promise.all([
        this.getUserStats(userId),
        this.admin
          .from('user_profiles')
          .select('badges')
          .eq('id', userId)
          .single(),
      ]);
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
      const currentBadges = badgeProfile?.badges || [];
      const hasNewBadges = newEarnedIds.some(
        (id) => !currentBadges.includes(id),
      );
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
    type: 'posts' | 'topics' | 'nooks' | 'all' = 'all',
    page: number = 1,
    limit: number = 20,
    currentUserId?: string,
  ) {
    logger.info('Fetching user activity', { userId, type, page, limit });

    const offset = (page - 1) * limit;
    const activities: any[] = [];
    let totalCount = 0;
    const viewerId = currentUserId || userId;

    try {
      const perSourceLimit = type === 'all' ? limit : limit;
      const perSourceOffset = type === 'all' ? 0 : offset;
      const now = new Date().toISOString();

      // Fire all content queries in PARALLEL
      const [postsResult, topicsResult, nooksResult] = await Promise.all([
        type === 'posts' || type === 'all'
          ? this.admin
              .from('feed_posts')
              .select(
                `id, user_id, content, is_anonymous, tags, visibility, likes_count, comments_count, shares_count, views_count, created_at, user_profile:user_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted)`,
                { count: 'exact' },
              )
              .eq('user_id', userId)
              .eq('is_archived', false)
              .order('created_at', { ascending: false })
              .range(perSourceOffset, perSourceOffset + perSourceLimit - 1)
          : Promise.resolve({ data: null, count: 0 }),
        type === 'topics' || type === 'all'
          ? this.admin
              .from('forum_topics')
              .select(
                `id, user_id, title, content, is_anonymous, tags, scope, views_count, comments_count, reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count, created_at, user_profile:user_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted), forum:forums(id, name)`,
                { count: 'exact' },
              )
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .range(perSourceOffset, perSourceOffset + perSourceLimit - 1)
          : Promise.resolve({ data: null, count: 0 }),
        type === 'nooks' || type === 'all'
          ? this.admin
              .from('nooks')
              .select(
                `id, title, description, creator_id, urgency, scope, temperature, hashtags, members_count, messages_count, expires_at, created_at, user_profile:creator_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted)`,
                { count: 'exact' },
              )
              .eq('creator_id', userId)
              .gt('expires_at', now)
              .order('created_at', { ascending: false })
              .range(perSourceOffset, perSourceOffset + perSourceLimit - 1)
          : Promise.resolve({ data: null, count: 0 }),
      ]);

      // Process posts
      if (type === 'posts' || type === 'all') {
        const { data: posts, count } = postsResult;

        if (type === 'posts') totalCount = count || 0;

        activities.push(
          ...(posts || []).map((p: any) => {
            const userProfile = Array.isArray(p.user_profile)
              ? p.user_profile[0]
              : p.user_profile;
            return {
              type: 'post',
              content_type: 'post',
              id: p.id,
              content_id: p.id,
              user_id: p.user_id,
              is_anonymous: p.is_anonymous,
              author: {
                display_name: userProfile?.username || 'Unknown',
                username: userProfile?.username || 'Unknown',
                bio: userProfile?.bio || null,
                avatar: userProfile?.avatar || 'User',
                first_name_encrypted: userProfile?.first_name_encrypted,
                last_name_encrypted: userProfile?.last_name_encrypted,
              },
              content: {
                text: p.content,
                tags: p.tags,
              },
              visibility: p.visibility,
              engagement: {
                likes: p.likes_count,
                comments: p.comments_count,
                shares: p.shares_count,
                views: p.views_count,
              },
              created_at: p.created_at,
            };
          }),
        );
      }

      if (type === 'topics' || type === 'all') {
        const { data: topics, count } = topicsResult;

        if (type === 'topics') totalCount = count || 0;

        activities.push(
          ...(topics || []).map((t: any) => {
            const totalReactions =
              (t.reaction_seen_count || 0) +
              (t.reaction_validated_count || 0) +
              (t.reaction_inspired_count || 0) +
              (t.reaction_heard_count || 0);
            const userProfile = Array.isArray(t.user_profile)
              ? t.user_profile[0]
              : t.user_profile;

            return {
              type: 'topic',
              content_type: 'topic',
              id: t.id,
              content_id: t.id,
              user_id: t.user_id,
              is_anonymous: t.is_anonymous,
              author: {
                display_name: userProfile?.username || 'Unknown',
                username: userProfile?.username || 'Unknown',
                bio: userProfile?.bio || null,
                avatar: userProfile?.avatar || 'User',
                first_name_encrypted: userProfile?.first_name_encrypted,
                last_name_encrypted: userProfile?.last_name_encrypted,
              },
              content: {
                title: t.title,
                text: t.content,
                forum_name: t.forum?.name || null,
                tags: t.tags,
              },
              engagement: {
                likes: totalReactions,
                comments: t.comments_count,
                views: t.views_count,
              },
              reaction_counts: {
                seen: t.reaction_seen_count || 0,
                validated: t.reaction_validated_count || 0,
                inspired: t.reaction_inspired_count || 0,
                heard: t.reaction_heard_count || 0,
              },
              created_at: t.created_at,
            };
          }),
        );
      }

      if (type === 'nooks' || type === 'all') {
        const { data: nooks, count } = nooksResult;

        if (type === 'nooks') totalCount = count || 0;

        activities.push(
          ...(nooks || []).map((nook: any) => {
            const userProfile = Array.isArray(nook.user_profile)
              ? nook.user_profile[0]
              : nook.user_profile;
            const timeLeft = this.calculateTimeLeft(nook.expires_at);

            return {
              type: 'nook_message',
              content_type: 'nook_message',
              id: nook.id,
              content_id: nook.id,
              user_id: nook.creator_id,
              is_anonymous: false,
              author: {
                display_name: userProfile?.username || 'Unknown',
                username: userProfile?.username || 'Unknown',
                bio: userProfile?.bio || null,
                avatar: userProfile?.avatar || 'User',
                first_name_encrypted: userProfile?.first_name_encrypted,
                last_name_encrypted: userProfile?.last_name_encrypted,
              },
              content: {
                title: nook.title,
                text: nook.description,
                nook_name: nook.title,
                nook_urgency: nook.urgency || 'medium',
                nook_scope: nook.scope || 'company',
                nook_temperature: nook.temperature || 'cool',
                nook_members: nook.members_count || 0,
                nook_time_left: timeLeft,
              },
              engagement: {
                likes: 0,
                comments: nook.messages_count || 0,
              },
              expires_at: nook.expires_at,
              created_at: nook.created_at,
            };
          }),
        );
      }

      // Sort all activities by date
      activities.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      // For 'all' type, manually paginate the merged results
      const paginatedActivities =
        type === 'all' ? activities.slice(offset, offset + limit) : activities;

      // Enrich with user engagement data (likes, bookmarks, reactions)
      const enriched = await this.enrichActivityWithEngagement(
        viewerId,
        paginatedActivities,
      );

      // Apply identity reveals
      await this.applyActivityIdentityReveals(viewerId, enriched);

      // For 'all', total is approximated from what we fetched
      const total = type === 'all' ? activities.length : totalCount;

      return {
        success: true,
        data: enriched,
        pagination: {
          page,
          limit,
          total,
          hasMore:
            type === 'all'
              ? activities.length > offset + limit
              : totalCount > offset + limit,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch user activity', { error });
      throw new BadRequestException('Failed to fetch user activity');
    }
  }

  private calculateTimeLeft(expiresAt: string | null): string {
    if (!expiresAt) return 'N/A';

    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }

  private async enrichActivityWithEngagement(
    userId: string,
    items: any[],
  ): Promise<any[]> {
    if (items.length === 0) return items;

    const contentIds = items.map((i) => i.content_id);
    const postIds = items
      .filter((i) => i.content_type === 'post')
      .map((i) => i.content_id);
    const topicIds = items
      .filter((i) => i.content_type === 'topic')
      .map((i) => i.content_id);

    const [
      { data: likes },
      { data: bookmarks },
      { data: feedUserReactions },
      { data: feedAllReactions },
      { data: topicUserReactions },
    ] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .in('content_id', contentIds),
      this.admin
        .from('feed_bookmarks')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .in('content_id', contentIds),
      // Post reactions from feed_reactions
      postIds.length > 0
        ? this.admin
            .from('feed_reactions')
            .select('content_type, content_id, reaction_type')
            .eq('user_id', userId)
            .in('content_id', postIds)
        : Promise.resolve({ data: [] }),
      postIds.length > 0
        ? this.admin
            .from('feed_reactions')
            .select('content_type, content_id, reaction_type')
            .in('content_id', postIds)
        : Promise.resolve({ data: [] }),
      // Topic reactions from topic_reactions table
      topicIds.length > 0
        ? this.admin
            .from('topic_reactions')
            .select('topic_id, reaction_type')
            .eq('user_id', userId)
            .in('topic_id', topicIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likeSet = new Set(
      (likes || []).map((l: any) => `${l.content_type}_${l.content_id}`),
    );
    const bookmarkSet = new Set(
      (bookmarks || []).map((b: any) => `${b.content_type}_${b.content_id}`),
    );

    // Post user reactions (from feed_reactions)
    const feedUserReactionMap = new Map<string, Set<string>>();
    (feedUserReactions || []).forEach((r: any) => {
      const key = `${r.content_type}_${r.content_id}`;
      if (!feedUserReactionMap.has(key))
        feedUserReactionMap.set(key, new Set());
      feedUserReactionMap.get(key)!.add(r.reaction_type);
    });

    // Post reaction counts (from feed_reactions)
    const feedReactionCounts = new Map<string, Record<string, number>>();
    (feedAllReactions || []).forEach((r: any) => {
      const key = `${r.content_type}_${r.content_id}`;
      if (!feedReactionCounts.has(key))
        feedReactionCounts.set(key, { heard: 0, validated: 0, inspired: 0 });
      const counts = feedReactionCounts.get(key)!;
      if (counts[r.reaction_type] !== undefined) counts[r.reaction_type]++;
    });

    // Topic user reactions (from topic_reactions)
    const topicUserReactionMap = new Map<string, Set<string>>();
    (topicUserReactions || []).forEach((r: any) => {
      if (!topicUserReactionMap.has(r.topic_id))
        topicUserReactionMap.set(r.topic_id, new Set());
      topicUserReactionMap.get(r.topic_id)!.add(r.reaction_type);
    });

    return items.map((item) => {
      const key = `${item.content_type}_${item.content_id}`;

      if (item.content_type === 'topic') {
        // Topics: reaction_counts already set from DB columns, user_reactions from topic_reactions
        const topicReactions = topicUserReactionMap.get(item.content_id);
        return {
          ...item,
          user_liked: likeSet.has(key),
          user_bookmarked: bookmarkSet.has(key),
          user_reactions: {
            seen: topicReactions?.has('seen') || false,
            validated: topicReactions?.has('validated') || false,
            inspired: topicReactions?.has('inspired') || false,
            heard: topicReactions?.has('heard') || false,
          },
          // reaction_counts already set from topic DB columns in the mapping above
        };
      }

      // Posts and nooks: use feed_reactions
      return {
        ...item,
        user_liked: likeSet.has(key),
        user_bookmarked: bookmarkSet.has(key),
        user_reactions: {
          heard: feedUserReactionMap.get(key)?.has('heard') || false,
          validated: feedUserReactionMap.get(key)?.has('validated') || false,
          inspired: feedUserReactionMap.get(key)?.has('inspired') || false,
        },
        reaction_counts: feedReactionCounts.get(key) || {
          heard: 0,
          validated: 0,
          inspired: 0,
        },
      };
    });
  }

  private async applyActivityIdentityReveals(
    userId: string,
    items: any[],
  ): Promise<void> {
    if (items.length === 0) return;

    const otherAuthorIds = [
      ...new Set(
        items
          .filter((item) => item.user_id && item.user_id !== userId)
          .map((item) => item.user_id),
      ),
    ];

    const revealedIds = await this.identityReveal.getRevealedUserIds(
      userId,
      otherAuthorIds,
    );

    items.forEach((item) => {
      if (!item.author) return;

      const isOwnContent = item.user_id === userId;
      const isRevealed = revealedIds.has(item.user_id);

      // Own content: always show real name (even if anonymous — it's YOUR activity page)
      // Revealed non-anonymous: show real name
      if (isOwnContent || (!item.is_anonymous && isRevealed)) {
        const realName = this.identityReveal.decryptRealName(
          item.author.first_name_encrypted,
          item.author.last_name_encrypted,
        );
        if (realName) {
          item.author.display_name = realName;
        }
      }

      // Clean encrypted fields from response
      delete item.author.first_name_encrypted;
      delete item.author.last_name_encrypted;
    });

    // Clean is_anonymous from response
    items.forEach((item) => {
      delete item.is_anonymous;
    });
  }
}
