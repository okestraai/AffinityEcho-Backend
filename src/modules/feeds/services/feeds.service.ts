import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { QueryFeedDto, FeedFilter, FeedSortBy, ContentTypeFilter } from '../dto/query-feed.dto';
import { FeedRankingService } from './feed-ranking.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';

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
}

@Injectable()
export class FeedsService {
  private admin;

  constructor(
    private config: ConfigService,
    private feedRanking: FeedRankingService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
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
    } = queryDto;

    const offset = (page - 1) * limit;

    try {
      // Pre-fetch following IDs once (instead of 3 times per content type)
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
        followingIds = followingUsers.map((f) => f.following_id);
      }

      // Fetch content types in parallel with DB-level limits
      const fetchLimit = contentType === ContentTypeFilter.ALL ? limit : limit;
      const contentFetchers: Promise<FeedItem[]>[] = [];

      if (contentType === ContentTypeFilter.ALL || contentType === ContentTypeFilter.POST) {
        contentFetchers.push(this.getFeedPosts(userId, filter, sortBy, company, tags, fetchLimit, 0, followingIds));
      }
      if (contentType === ContentTypeFilter.ALL || contentType === ContentTypeFilter.TOPIC) {
        contentFetchers.push(this.getForumTopics(userId, filter, sortBy, company, tags, fetchLimit, 0, followingIds));
      }
      if (contentType === ContentTypeFilter.ALL || contentType === ContentTypeFilter.NOOK) {
        contentFetchers.push(this.getNookMessages(userId, filter, sortBy, company, tags, fetchLimit, 0, followingIds));
      }

      const results = await Promise.all(contentFetchers);
      const feedItems: FeedItem[] = results.flat();

      // Sort the combined feed — engagement ranking is the default
      let sortedFeed: any[];
      if (sortBy === FeedSortBy.ENGAGEMENT) {
        sortedFeed = this.feedRanking.rankByEngagement(feedItems);
      } else {
        sortedFeed = this.sortFeedItems(feedItems, sortBy);
      }

      // Paginate the combined results
      const paginatedFeed = sortedFeed.slice(offset, offset + limit);

      // Enrich with user engagement data
      const enrichedFeed = await this.enrichWithUserEngagement(userId, paginatedFeed);

      // Apply identity reveal — show real name for revealed users
      await this.applyIdentityReveals(userId, enrichedFeed);

      return {
        success: true,
        data: enrichedFeed,
        pagination: {
          page,
          limit,
          total: sortedFeed.length,
          hasMore: sortedFeed.length > offset + limit,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch aggregated feed', { error });
      throw new BadRequestException('Failed to fetch feed');
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
          has_completed_onboarding
        )
      `,
      )
      .eq('is_archived', false)
      .eq('user_profile.has_completed_onboarding', true);

    // Apply filters
    if (filter === FeedFilter.COMPANY || company) {
      query = query.eq('visibility', 'company');
    } else if (filter === FeedFilter.GLOBAL) {
      query = query.eq('visibility', 'global');
    } else if (filter === FeedFilter.FOLLOWING) {
      if (followingIds && followingIds.length > 0) {
        query = query.in('user_id', followingIds);
      } else {
        return [];
      }
    }

    // Apply tag filter
    if (tags && tags.length > 0) {
      query = query.contains('tags', tags);
    }

    // Apply sorting and limit at DB level
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
          has_completed_onboarding
        ),
        forum:forums(
          id,
          name
        )
      `,
      )
      .eq('is_locked', false)
      .eq('user_profile.has_completed_onboarding', true);

    // Apply filters
    if (filter === FeedFilter.COMPANY || company) {
      query = query.eq('scope', 'company');
      if (company) {
        query = query.eq('company_name', company);
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

    // Apply tag filter
    if (tags && tags.length > 0) {
      query = query.contains('tags', tags);
    }

    // Apply sorting and limit at DB level
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
          has_completed_onboarding
        )
      `,
      )
      .eq('is_active', true)
      .gt('expires_at', now)
      .eq('user_profile.has_completed_onboarding', true);

    // Apply filters based on nook scope
    if (filter === FeedFilter.COMPANY || company) {
      query = query.eq('scope', 'company');
    } else if (filter === FeedFilter.GLOBAL) {
      query = query.eq('scope', 'global');
    } else if (filter === FeedFilter.FOLLOWING) {
      if (followingIds && followingIds.length > 0) {
        query = query.in('creator_id', followingIds);
      } else {
        return [];
      }
    }

    // Apply sorting and limit at DB level
    query = this.applySorting(query, sortBy, 'nook');
    query = query.limit(limit);

    const { data: nooks, error } = await query;

    if (error) {
      logger.error('Error fetching nooks for feed', { error });
      return [];
    }

    return (nooks || []).map((nook: any) => {
      const userProfile = Array.isArray(nook.user_profile) ? nook.user_profile[0] : nook.user_profile;
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

  private applySorting(query: any, sortBy: FeedSortBy, contentType: 'post' | 'topic' | 'nook') {
    switch (sortBy) {
      case FeedSortBy.RECENT:
        return query.order('created_at', { ascending: false });

      case FeedSortBy.POPULAR:
      case FeedSortBy.MOST_LIKED:
        if (contentType === 'post') {
          return query.order('likes_count', { ascending: false });
        } else if (contentType === 'topic') {
          // Sort by total reactions
          return query.order('created_at', { ascending: false }); // Fallback to recent for now
        } else {
          return query.order('created_at', { ascending: false });
        }

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
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      case FeedSortBy.POPULAR:
      case FeedSortBy.MOST_LIKED:
        return items.sort((a, b) => (b.engagement.likes || 0) - (a.engagement.likes || 0));

      case FeedSortBy.MOST_COMMENTED:
        return items.sort((a, b) => (b.engagement.comments || 0) - (a.engagement.comments || 0));

      default:
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }

  private async enrichWithUserEngagement(userId: string, items: FeedItem[]): Promise<FeedItem[]> {
    if (items.length === 0) return items;

    // Fetch likes, shares, and bookmarks in parallel (instead of sequentially)
    const [{ data: likes }, { data: shares }, { data: bookmarks }] = await Promise.all([
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
    ]);

    const likeMap = new Set((likes || []).map((l) => `${l.content_type}_${l.content_id}`));
    const shareMap = new Set((shares || []).map((s) => `${s.content_type}_${s.content_id}`));
    const bookmarkMap = new Set((bookmarks || []).map((b) => `${b.content_type}_${b.content_id}`));

    return items.map((item) => ({
      ...item,
      user_liked: likeMap.has(`${item.content_type}_${item.content_id}`),
      user_shared: shareMap.has(`${item.content_type}_${item.content_id}`),
      user_bookmarked: bookmarkMap.has(`${item.content_type}_${item.content_id}`),
    }));
  }

  /**
   * For each feed item, check if the author has an accepted identity reveal
   * with the current user. If so, replace display_name with their real name.
   */
  private async applyIdentityReveals(userId: string, items: any[]): Promise<void> {
    if (items.length === 0) return;

    // Get all other author IDs (exclude self — own content always gets real name)
    const otherAuthorIds = [...new Set(
      items
        .filter((item) => item.user_id && item.user_id !== userId)
        .map((item) => item.user_id),
    )];

    // Get revealed IDs using shared utility
    const revealedIds = await this.identityReveal.getRevealedUserIds(userId, otherAuthorIds);

    // Update display_name for all items
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

    // Clean up encrypted fields from response
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
}
