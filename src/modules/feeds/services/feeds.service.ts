import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import {
  QueryFeedDto,
  FeedFilter,
  FeedSortBy,
  ContentTypeFilter,
} from '../dto/query-feed.dto';
import { FeedRankingService, RankingContext } from './feed-ranking.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { RedisService } from '../../../common/services/redis.service';
import { MSG } from '../../../common/constants/messages';
import { ContentSafetyService } from '../../content-safety/content-safety.service';

interface FeedItem {
  id: string;
  content_type: 'post' | 'topic' | 'nook_message';
  content_id: string;
  user_id: string;
  author: {
    display_name: string;
    bio: string | null;
    avatar?: string;
  };
  content: any;
  engagement: {
    likes: number;
    comments: number;
    shares?: number;
    seen?: number;
  };
  created_at: string;
  user_liked?: boolean;
  user_shared?: boolean;
  user_bookmarked?: boolean;
  reaction_counts?: Record<string, number>;
  user_reactions?: Record<string, boolean>;
}

@Injectable()
export class FeedsService {
  private admin;

  constructor(
    private config: ConfigService,
    private feedRanking: FeedRankingService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
    private redis: RedisService,
    private contentSafety: ContentSafetyService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Fetch user's company list (current + alumni) for company-scoped filtering.
   */
  private async getUserCompanyList(userId: string): Promise<string[]> {
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('company_encrypted, company_alumni_encrypted')
      .eq('id', userId)
      .single();

    if (!profile) return [];

    const companies: string[] = [];

    if (profile.company_encrypted) {
      try {
        companies.push(this.encryption.decrypt(profile.company_encrypted));
      } catch {}
    }

    if (
      profile.company_alumni_encrypted &&
      Array.isArray(profile.company_alumni_encrypted)
    ) {
      for (const alumniEncrypted of profile.company_alumni_encrypted) {
        try {
          companies.push(this.encryption.decrypt(alumniEncrypted));
        } catch {}
      }
    }

    return companies.filter(Boolean);
  }

  async getAggregatedFeed(userId: string, queryDto: QueryFeedDto) {
    logger.info('Fetching aggregated feed', { userId, queryDto });

    const {
      filter = FeedFilter.ALL,
      contentType = ContentTypeFilter.ALL,
      sortBy = FeedSortBy.ENGAGEMENT,
      company,
      tags,
      page = 1,
      limit = 20,
      seenIds = [],
    } = queryDto;

    const offset = (page - 1) * limit;

    // Cache key excludes seenIds and page — we cache the full ranked feed and paginate after.
    // seenIds suppression + diversity are applied post-cache (fast, in-memory).
    const baseCacheKey = `feeds:v2:${userId}:${filter}:${contentType}:${sortBy}:${company || ''}:${(tags || []).join(',')}:${limit}`;

    try {
      let sortedFeed = await this.redis.get<any[]>(baseCacheKey);

      if (!sortedFeed) {
        // Pre-fetch following IDs once
        let followingIds: string[] | null = null;
        if (filter === FeedFilter.FOLLOWING) {
          const { data: followingUsers } = await this.admin
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', userId);

          if (!followingUsers || followingUsers.length === 0) {
            return {
              success: true,
              data: [],
              pagination: { page, limit, total: 0, hasMore: false },
            };
          }
          followingIds = followingUsers.map((f: any) => f.following_id);
        }

        const trendingCutoff =
          filter === FeedFilter.TRENDING
            ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            : null;

        // Fetch 3x limit per content type to support pagination + diversity filtering
        const fetchLimit = Math.min(limit * 3, 100);
        const contentFetchers: Promise<FeedItem[]>[] = [];

        // Pre-fetch user's company list for company-scoped filtering
        let userCompanyList: string[] | null = null;
        if (filter === FeedFilter.COMPANY || company) {
          userCompanyList = await this.getUserCompanyList(userId);
        }

        if (
          contentType === ContentTypeFilter.ALL ||
          contentType === ContentTypeFilter.POST
        ) {
          contentFetchers.push(
            this.getFeedPosts(
              userId,
              filter,
              sortBy,
              company,
              tags,
              fetchLimit,
              0,
              followingIds,
              trendingCutoff,
              userCompanyList,
            ),
          );
        }
        if (
          contentType === ContentTypeFilter.ALL ||
          contentType === ContentTypeFilter.TOPIC
        ) {
          contentFetchers.push(
            this.getForumTopics(
              userId,
              filter,
              sortBy,
              company,
              tags,
              fetchLimit,
              0,
              followingIds,
              trendingCutoff,
              userCompanyList,
            ),
          );
        }
        if (
          contentType === ContentTypeFilter.ALL ||
          contentType === ContentTypeFilter.NOOK
        ) {
          contentFetchers.push(
            this.getNookMessages(
              userId,
              filter,
              sortBy,
              company,
              tags,
              fetchLimit,
              0,
              followingIds,
              trendingCutoff,
              userCompanyList,
            ),
          );
        }

        // Fetch all personalization signals in parallel with content
        const [
          contentResults,
          tagAffinities,
          authorAffinities,
          contentTypePrefs,
        ] = await Promise.all([
          Promise.all(contentFetchers),
          this.getUserEngagementProfile(userId),
          this.getUserAuthorAffinities(userId),
          this.getUserContentTypePreference(userId),
        ]);

        let feedItems: FeedItem[] = contentResults.flat();

        // Filter out blocked users' content (only on fresh build — block list rarely changes)
        const blockedIds =
          await this.contentSafety.getBlockedUserIds(userId);

        if (blockedIds.length > 0) {
          const blockedSet = new Set(blockedIds);
          feedItems = feedItems.filter(
            (item) => !blockedSet.has(item.user_id),
          );
        }

        const context: RankingContext = {
          userId,
          userAffinities: tagAffinities,
          authorAffinities,
          contentTypePrefs,
        };

        if (filter === FeedFilter.TRENDING) {
          sortedFeed = this.feedRanking.rankByTrending(feedItems);
        } else if (sortBy === FeedSortBy.ENGAGEMENT) {
          sortedFeed = this.feedRanking.rankByEngagement(feedItems, context);
        } else {
          sortedFeed = this.sortFeedItems(feedItems, sortBy);
        }

        await this.redis.set(baseCacheKey, sortedFeed, 120000);
      }

      // Filter out user-hidden content post-cache so hides take effect immediately
      const [hiddenPostIds, hiddenTopicIds, hiddenNookIds] = await Promise.all([
        this.contentSafety.getHiddenContentIds(userId, 'post'),
        this.contentSafety.getHiddenContentIds(userId, 'topic'),
        this.contentSafety.getHiddenContentIds(userId, 'nook'),
      ]);

      const hiddenSet = new Set([
        ...hiddenPostIds,
        ...hiddenTopicIds,
        ...hiddenNookIds,
      ]);
      if (hiddenSet.size > 0) {
        sortedFeed = sortedFeed.filter(
          (item: any) => !hiddenSet.has(item.content_id),
        );
      }

      // Apply seenIds suppression post-cache — seen items rank lower, not removed
      let processedFeed: any[] = sortedFeed;
      if (seenIds.length > 0) {
        const seenMap = new Map(seenIds.map((id: string) => [id, 1]));
        processedFeed = this.feedRanking.applySuppression(
          processedFeed,
          seenMap,
        );
      }

      // Apply diversity constraints over the slice needed for this page.
      // Requesting offset+limit items ensures page consistency across pages:
      //   page 1 gets items [0:20], page 2 gets [20:40] from the same diversity pass.
      const totalNeeded = offset + limit;
      const diverseFeed = this.feedRanking.applyDiversityConstraints(
        processedFeed,
        totalNeeded,
      );

      // Paginate from the diversity-constrained result
      const paginatedFeed = diverseFeed.slice(offset, offset + limit);

      // Enrich with user engagement data
      const enrichedFeed = await this.enrichWithUserEngagement(
        userId,
        paginatedFeed,
      );

      // Apply identity reveal — show real name for revealed users
      await this.applyIdentityReveals(userId, enrichedFeed);

      return {
        success: true,
        data: enrichedFeed,
        pagination: {
          page,
          limit,
          total: diverseFeed.length,
          hasMore: diverseFeed.length > offset + limit,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch aggregated feed', { error });
      throw new BadRequestException(MSG.FEED.FEED_FAILED);
    }
  }

  private async getFeedPosts(
    userId: string,
    filter: FeedFilter,
    sortBy: FeedSortBy,
    company?: string,
    tags?: string[],
    limit: number = 20,
    offset: number = 0,
    followingIds?: string[] | null,
    trendingCutoff?: string | null,
    userCompanyList?: string[] | null,
  ): Promise<FeedItem[]> {
    let query = this.admin
      .from('feed_posts')
      .select(
        `
        id,
        user_id,
        content,
        visibility,
        is_anonymous,
        tags,
        likes_count,
        comments_count,
        shares_count,
        views_count,
        created_at,
        user_profile:user_id!inner(
          id,
          username,
          avatar,
          bio,
          first_name_encrypted,
          last_name_encrypted,
          has_completed_onboarding,
          is_company_verified
        )
      `,
      )
      .eq('is_archived', false)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .eq('user_profile.has_completed_onboarding', true)
      .neq('user_id', userId);

    if (filter === FeedFilter.COMPANY || company) {
      query = query.eq('visibility', 'company');
      // Filter by user's company list (current + alumni)
      const companyList =
        userCompanyList && userCompanyList.length > 0 ? userCompanyList : [];
      if (company) {
        query = query.eq('company_name', company);
      } else if (companyList.length > 0) {
        query = query.in('company_name', companyList);
      }
    } else if (filter === FeedFilter.GLOBAL) {
      query = query.eq('visibility', 'global');
    } else if (filter === FeedFilter.FOLLOWING) {
      if (followingIds && followingIds.length > 0) {
        query = query.in('user_id', followingIds);
      } else {
        return [];
      }
    }

    if (tags && tags.length > 0) {
      query = query.contains('tags', tags);
    }

    if (trendingCutoff) {
      query = query.gte('created_at', trendingCutoff);
    }

    query = this.applySorting(query, sortBy, 'post');
    query = query.limit(limit);

    const { data: posts, error } = await query;

    if (error) {
      logger.error('Error fetching feed posts', { error });
      return [];
    }

    return (posts || []).map((post: any) => ({
      id: `post_${post.id}`,
      content_type: 'post' as const,
      content_id: post.id,
      user_id: post.user_id,
      is_anonymous: post.is_anonymous,
      author: {
        display_name: post.user_profile?.username || 'Unknown',
        username: post.user_profile?.username || 'Unknown',
        bio: post.user_profile?.bio || null,
        avatar: post.user_profile?.avatar || 'User',
        first_name_encrypted: post.user_profile?.first_name_encrypted,
        last_name_encrypted: post.user_profile?.last_name_encrypted,
        is_company_verified: post.user_profile?.is_company_verified || false,
      },
      content: {
        text: post.content,
        tags: post.tags,
      },
      engagement: {
        likes: post.likes_count,
        comments: post.comments_count,
        shares: post.shares_count,
        seen: post.views_count,
      },
      created_at: post.created_at,
    }));
  }

  private async getForumTopics(
    userId: string,
    filter: FeedFilter,
    sortBy: FeedSortBy,
    company?: string,
    tags?: string[],
    limit: number = 20,
    offset: number = 0,
    followingIds?: string[] | null,
    trendingCutoff?: string | null,
    userCompanyList?: string[] | null,
  ): Promise<FeedItem[]> {
    let query = this.admin
      .from('forum_topics')
      .select(
        `
        id,
        user_id,
        forum_id,
        title,
        content,
        is_anonymous,
        tags,
        scope,
        company_name,
        views_count,
        comments_count,
        reaction_seen_count,
        reaction_validated_count,
        reaction_inspired_count,
        reaction_heard_count,
        created_at,
        user_profile:user_id!inner(
          id,
          username,
          avatar,
          bio,
          first_name_encrypted,
          last_name_encrypted,
          has_completed_onboarding,
          is_company_verified
        ),
        forum:forums(
          id,
          name
        )
      `,
      )
      .eq('is_locked', false)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .eq('user_profile.has_completed_onboarding', true)
      .neq('user_id', userId);

    if (filter === FeedFilter.COMPANY || company) {
      query = query.eq('scope', 'company');
      const companyList =
        userCompanyList && userCompanyList.length > 0 ? userCompanyList : [];
      if (company) {
        query = query.eq('company_name', company);
      } else if (companyList.length > 0) {
        query = query.in('company_name', companyList);
      }
    } else if (filter === FeedFilter.GLOBAL) {
      query = query.eq('scope', 'global');
    } else if (filter === FeedFilter.FOLLOWING) {
      if (followingIds && followingIds.length > 0) {
        query = query.in('user_id', followingIds);
      } else {
        return [];
      }
    }

    if (tags && tags.length > 0) {
      query = query.contains('tags', tags);
    }

    if (trendingCutoff) {
      query = query.gte('created_at', trendingCutoff);
    }

    query = this.applySorting(query, sortBy, 'topic');
    query = query.limit(limit);

    const { data: topics, error } = await query;

    if (error) {
      logger.error('Error fetching forum topics', { error });
      return [];
    }

    return (topics || []).map((topic: any) => {
      const totalReactions =
        topic.reaction_seen_count +
        topic.reaction_validated_count +
        topic.reaction_inspired_count +
        topic.reaction_heard_count;

      return {
        id: `topic_${topic.id}`,
        content_type: 'topic' as const,
        content_id: topic.id,
        user_id: topic.user_id,
        is_anonymous: topic.is_anonymous,
        author: {
          display_name: topic.user_profile?.username || 'Unknown',
          username: topic.user_profile?.username || 'Unknown',
          bio: topic.user_profile?.bio || null,
          avatar: topic.user_profile?.avatar || 'User',
          first_name_encrypted: topic.user_profile?.first_name_encrypted,
          last_name_encrypted: topic.user_profile?.last_name_encrypted,
          is_company_verified: topic.user_profile?.is_company_verified || false,
        },
        content: {
          title: topic.title,
          text: topic.content,
          forum_name: topic.forum?.name || 'Unknown Forum',
          tags: topic.tags,
        },
        engagement: {
          likes: totalReactions,
          comments: topic.comments_count,
          seen: topic.views_count,
        },
        reaction_counts: {
          seen: topic.reaction_seen_count || 0,
          validated: topic.reaction_validated_count || 0,
          inspired: topic.reaction_inspired_count || 0,
          heard: topic.reaction_heard_count || 0,
        },
        created_at: topic.created_at,
      };
    });
  }

  private async getNookMessages(
    userId: string,
    filter: FeedFilter,
    sortBy: FeedSortBy,
    company?: string,
    tags?: string[],
    limit: number = 20,
    offset: number = 0,
    followingIds?: string[] | null,
    trendingCutoff?: string | null,
    userCompanyList?: string[] | null,
  ): Promise<FeedItem[]> {
    const now = new Date().toISOString();

    let query = this.admin
      .from('nooks')
      .select(
        `
        id,
        title,
        description,
        creator_id,
        urgency,
        scope,
        temperature,
        hashtags,
        members_count,
        messages_count,
        expires_at,
        created_at,
        user_profile:creator_id!inner(
          id,
          username,
          avatar,
          bio,
          first_name_encrypted,
          last_name_encrypted,
          has_completed_onboarding,
          is_company_verified
        )
      `,
      )
      .eq('is_active', true)
      .gt('expires_at', now)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .eq('user_profile.has_completed_onboarding', true)
      .neq('creator_id', userId);

    if (filter === FeedFilter.COMPANY || company) {
      query = query.eq('scope', 'company');
      const companyList =
        userCompanyList && userCompanyList.length > 0 ? userCompanyList : [];
      if (company) {
        query = query.eq('company_name', company);
      } else if (companyList.length > 0) {
        query = query.in('company_name', companyList);
      }
    } else if (filter === FeedFilter.GLOBAL) {
      query = query.eq('scope', 'global');
    } else if (filter === FeedFilter.FOLLOWING) {
      if (followingIds && followingIds.length > 0) {
        query = query.in('creator_id', followingIds);
      } else {
        return [];
      }
    }

    if (trendingCutoff) {
      query = query.gte('created_at', trendingCutoff);
    }

    query = this.applySorting(query, sortBy, 'nook');
    query = query.limit(limit);

    const { data: nooks, error } = await query;

    if (error) {
      logger.error('Error fetching nooks for feed', { error });
      return [];
    }

    return (nooks || []).map((nook: any) => {
      const userProfile = Array.isArray(nook.user_profile)
        ? nook.user_profile[0]
        : nook.user_profile;
      const timeLeft = this.calculateTimeLeft(nook.expires_at);

      return {
        id: `nook_${nook.id}`,
        content_type: 'nook_message' as const,
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
          is_company_verified: userProfile?.is_company_verified || false,
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
        created_at: nook.created_at,
      };
    });
  }

  private applySorting(
    query: any,
    sortBy: FeedSortBy,
    contentType: 'post' | 'topic' | 'nook',
  ) {
    switch (sortBy) {
      case FeedSortBy.RECENT:
        return query.order('created_at', { ascending: false });

      case FeedSortBy.POPULAR:
      case FeedSortBy.MOST_LIKED:
        if (contentType === 'post') {
          return query.order('likes_count', { ascending: false });
        }
        return query.order('created_at', { ascending: false });

      case FeedSortBy.MOST_COMMENTED:
        if (contentType === 'post' || contentType === 'topic') {
          return query.order('comments_count', { ascending: false });
        }
        return query.order('created_at', { ascending: false });

      default:
        return query.order('created_at', { ascending: false });
    }
  }

  private sortFeedItems(items: FeedItem[], sortBy: FeedSortBy): FeedItem[] {
    switch (sortBy) {
      case FeedSortBy.RECENT:
        return items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

      case FeedSortBy.POPULAR:
      case FeedSortBy.MOST_LIKED:
        return items.sort(
          (a, b) => (b.engagement.likes || 0) - (a.engagement.likes || 0),
        );

      case FeedSortBy.MOST_COMMENTED:
        return items.sort(
          (a, b) => (b.engagement.comments || 0) - (a.engagement.comments || 0),
        );

      default:
        return items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }
  }

  private async enrichWithUserEngagement(
    userId: string,
    items: FeedItem[],
  ): Promise<any[]> {
    if (items.length === 0) return items;

    const postIds = items
      .filter((i) => i.content_type === 'post')
      .map((i) => i.content_id);
    const topicIds = items
      .filter((i) => i.content_type === 'topic')
      .map((i) => i.content_id);

    const [
      { data: likes },
      { data: shares },
      { data: bookmarks },
      { data: feedUserReactions },
      { data: feedAllReactions },
      { data: topicUserReactions },
    ] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .in('content_type', ['post', 'topic', 'nook_message']),
      this.admin
        .from('feed_shares')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .in('content_type', ['post', 'topic', 'nook_message']),
      this.admin
        .from('feed_bookmarks')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .in('content_type', ['post', 'topic', 'nook_message']),
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
      topicIds.length > 0
        ? this.admin
            .from('topic_reactions')
            .select('topic_id, reaction_type')
            .eq('user_id', userId)
            .in('topic_id', topicIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likeMap = new Set(
      (likes || []).map((l: any) => `${l.content_type}_${l.content_id}`),
    );
    const shareMap = new Set(
      (shares || []).map((s: any) => `${s.content_type}_${s.content_id}`),
    );
    const bookmarkMap = new Set(
      (bookmarks || []).map((b: any) => `${b.content_type}_${b.content_id}`),
    );

    const feedReactionMap = new Map<string, Set<string>>();
    (feedUserReactions || []).forEach((r: any) => {
      const key = `${r.content_type}_${r.content_id}`;
      if (!feedReactionMap.has(key)) feedReactionMap.set(key, new Set());
      feedReactionMap.get(key)!.add(r.reaction_type);
    });

    const feedReactionCounts = new Map<string, Record<string, number>>();
    (feedAllReactions || []).forEach((r: any) => {
      const key = `${r.content_type}_${r.content_id}`;
      if (!feedReactionCounts.has(key))
        feedReactionCounts.set(key, { heard: 0, validated: 0, inspired: 0 });
      const counts = feedReactionCounts.get(key)!;
      if (counts[r.reaction_type] !== undefined) counts[r.reaction_type]++;
    });

    const topicReactionMap = new Map<string, Set<string>>();
    (topicUserReactions || []).forEach((r: any) => {
      if (!topicReactionMap.has(r.topic_id))
        topicReactionMap.set(r.topic_id, new Set());
      topicReactionMap.get(r.topic_id)!.add(r.reaction_type);
    });

    return items.map((item) => {
      const key = `${item.content_type}_${item.content_id}`;

      if (item.content_type === 'topic') {
        const topicReactions = topicReactionMap.get(item.content_id);
        return {
          ...item,
          user_liked: likeMap.has(key),
          user_shared: shareMap.has(key),
          user_bookmarked: bookmarkMap.has(key),
          user_reactions: {
            seen: topicReactions?.has('seen') || false,
            validated: topicReactions?.has('validated') || false,
            inspired: topicReactions?.has('inspired') || false,
            heard: topicReactions?.has('heard') || false,
          },
        };
      }

      const feedReactions = feedReactionMap.get(key);
      return {
        ...item,
        user_liked: likeMap.has(key),
        user_shared: shareMap.has(key),
        user_bookmarked: bookmarkMap.has(key),
        user_reactions: {
          heard: feedReactions?.has('heard') || false,
          validated: feedReactions?.has('validated') || false,
          inspired: feedReactions?.has('inspired') || false,
        },
        reaction_counts: feedReactionCounts.get(key) || {
          heard: 0,
          validated: 0,
          inspired: 0,
        },
      };
    });
  }

  private async applyIdentityReveals(
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

      if (isOwnContent || isRevealed) {
        const realName = this.identityReveal.decryptRealName(
          item.author.first_name_encrypted,
          item.author.last_name_encrypted,
        );
        if (realName) {
          item.author.display_name = realName;
        }
      }
    });

    items.forEach((item) => {
      if (item.author) {
        delete item.author.first_name_encrypted;
        delete item.author.last_name_encrypted;
      }
      delete item.is_anonymous;
    });
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

  /**
   * Analyse the user's engagement history to build tag affinity scores.
   * Looks at the last 30 days of likes and comments.
   * Comments are weighted 2x (more intentional engagement).
   */
  private async getUserEngagementProfile(
    userId: string,
  ): Promise<Map<string, number>> {
    const cacheKey = `engagement-profile:${userId}`;
    const cached = await this.redis.get<[string, number][]>(cacheKey);
    if (cached) return new Map(cached);

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [likesResult, commentsResult] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      this.admin
        .from('feed_comments')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
    ]);

    const engagedContentIds: { type: string; id: string }[] = [];

    (likesResult.data || []).forEach((l: any) => {
      engagedContentIds.push({ type: l.content_type, id: l.content_id });
    });
    (commentsResult.data || []).forEach((c: any) => {
      engagedContentIds.push({ type: c.content_type, id: c.content_id });
      engagedContentIds.push({ type: c.content_type, id: c.content_id }); // 2x weight
    });

    if (engagedContentIds.length === 0) return new Map();

    const postIds = engagedContentIds
      .filter((e) => e.type === 'post')
      .map((e) => e.id);
    const topicIds = engagedContentIds
      .filter((e) => e.type === 'topic')
      .map((e) => e.id);

    const tagResults = await Promise.all([
      postIds.length > 0
        ? this.admin.from('feed_posts').select('tags').in('id', postIds)
        : Promise.resolve({ data: [] }),
      topicIds.length > 0
        ? this.admin.from('forum_topics').select('tags').in('id', topicIds)
        : Promise.resolve({ data: [] }),
    ]);

    const tagCounts = new Map<string, number>();
    [...(tagResults[0].data || []), ...(tagResults[1].data || [])].forEach(
      (item: any) => {
        (item.tags || []).forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      },
    );

    const maxCount = Math.max(...tagCounts.values(), 1);
    const affinities = new Map<string, number>();
    tagCounts.forEach((count, tag) => {
      affinities.set(tag, count / maxCount);
    });

    await this.redis.set(cacheKey, [...affinities.entries()], 900000);
    return affinities;
  }

  /**
   * Build author affinity scores from the user's 30-day engagement history.
   * Identifies which authors' content the user likes/comments on most,
   * normalised to 0-1. Comments are weighted 2x.
   */
  private async getUserAuthorAffinities(
    userId: string,
  ): Promise<Map<string, number>> {
    const cacheKey = `author-affinities:${userId}`;
    const cached = await this.redis.get<[string, number][]>(cacheKey);
    if (cached) return new Map(cached);

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [likesResult, commentsResult] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      this.admin
        .from('feed_comments')
        .select('content_type, content_id')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
    ]);

    const engagedContent: { type: string; id: string; weight: number }[] = [];
    (likesResult.data || []).forEach((l: any) =>
      engagedContent.push({
        type: l.content_type,
        id: l.content_id,
        weight: 1,
      }),
    );
    (commentsResult.data || []).forEach((c: any) =>
      engagedContent.push({
        type: c.content_type,
        id: c.content_id,
        weight: 2,
      }),
    );

    if (engagedContent.length === 0) return new Map();

    const postIds = engagedContent
      .filter((e) => e.type === 'post')
      .map((e) => e.id);
    const topicIds = engagedContent
      .filter((e) => e.type === 'topic')
      .map((e) => e.id);
    const nookIds = engagedContent
      .filter((e) => e.type === 'nook_message')
      .map((e) => e.id);

    const [postsResult, topicsResult, nooksResult] = await Promise.all([
      postIds.length > 0
        ? this.admin.from('feed_posts').select('id, user_id').in('id', postIds)
        : Promise.resolve({ data: [] }),
      topicIds.length > 0
        ? this.admin
            .from('forum_topics')
            .select('id, user_id')
            .in('id', topicIds)
        : Promise.resolve({ data: [] }),
      nookIds.length > 0
        ? this.admin.from('nooks').select('id, creator_id').in('id', nookIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Map content id → author id
    const contentAuthorMap = new Map<string, string>();
    (postsResult.data || []).forEach((p: any) =>
      contentAuthorMap.set(`post_${p.id}`, p.user_id),
    );
    (topicsResult.data || []).forEach((t: any) =>
      contentAuthorMap.set(`topic_${t.id}`, t.user_id),
    );
    (nooksResult.data || []).forEach((n: any) =>
      contentAuthorMap.set(`nook_message_${n.id}`, n.creator_id),
    );

    const authorCounts = new Map<string, number>();
    engagedContent.forEach(({ type, id, weight }) => {
      const authorId = contentAuthorMap.get(`${type}_${id}`);
      if (authorId && authorId !== userId) {
        authorCounts.set(authorId, (authorCounts.get(authorId) || 0) + weight);
      }
    });

    if (authorCounts.size === 0) return new Map();

    const maxCount = Math.max(...authorCounts.values(), 1);
    const affinities = new Map<string, number>();
    authorCounts.forEach((count, authorId) => {
      affinities.set(authorId, count / maxCount);
    });

    await this.redis.set(cacheKey, [...affinities.entries()], 900000);
    return affinities;
  }

  /**
   * Build content-type preference scores from the user's 30-day engagement history.
   * Returns a normalised 0-1 score per content type (post, topic, nook_message).
   * Comments are weighted 2x.
   */
  private async getUserContentTypePreference(
    userId: string,
  ): Promise<Map<string, number>> {
    const cacheKey = `content-type-prefs:${userId}`;
    const cached = await this.redis.get<[string, number][]>(cacheKey);
    if (cached) return new Map(cached);

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [likesResult, commentsResult] = await Promise.all([
      this.admin
        .from('feed_likes')
        .select('content_type')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      this.admin
        .from('feed_comments')
        .select('content_type')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
    ]);

    const counts = new Map<string, number>();
    (likesResult.data || []).forEach((l: any) => {
      counts.set(l.content_type, (counts.get(l.content_type) || 0) + 1);
    });
    (commentsResult.data || []).forEach((c: any) => {
      counts.set(c.content_type, (counts.get(c.content_type) || 0) + 2);
    });

    if (counts.size === 0) {
      await this.redis.set(cacheKey, [], 900000);
      return new Map();
    }

    const maxCount = Math.max(...counts.values(), 1);
    const prefs = new Map<string, number>();
    counts.forEach((count, type) => {
      prefs.set(type, count / maxCount);
    });

    await this.redis.set(cacheKey, [...prefs.entries()], 900000);
    return prefs;
  }
}
