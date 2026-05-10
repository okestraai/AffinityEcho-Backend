import { BadRequestException } from '@nestjs/common';
import { FeedsService } from '../../modules/feeds/services/feeds.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';
import {
  FeedFilter,
  FeedSortBy,
  ContentTypeFilter,
} from '../../modules/feeds/dto/query-feed.dto';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FeedsService', () => {
  let service: FeedsService;
  let mockClient: any;
  let mockConfig: any;
  let mockFeedRanking: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;
  let mockRedis: any;
  let mockContentSafety: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockConfig = createMockConfigService();

    mockFeedRanking = {
      rankByEngagement: jest.fn((items: any[]) => items),
      rankByTrending: jest.fn((items: any[]) => items),
      applyDiversityConstraints: jest.fn((items: any[], limit: number) =>
        items.slice(0, limit),
      ),
      applySuppression: jest.fn((items: any[]) => items),
    };

    mockEncryption = {
      encrypt: jest.fn((text: string) => 'enc_' + text),
      decrypt: jest.fn((text: string) => 'dec_' + text),
    };

    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
      isRevealed: jest.fn().mockResolvedValue(false),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn(),
    };

    mockContentSafety = {
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getHiddenContentIds: jest.fn().mockResolvedValue([]),
    };

    service = new FeedsService(
      mockConfig,
      mockFeedRanking,
      mockEncryption,
      mockIdentityReveal,
      mockRedis,
      mockContentSafety as any,
    );
  });

  /**
   * Helper: builds mock feed_posts rows so the getFeedPosts private method
   * can transform them into FeedItem objects.
   */
  function makeMockPost(id: string, userId: string) {
    return {
      id,
      user_id: userId,
      content: 'Post content for ' + id,
      visibility: 'global',
      is_anonymous: false,
      tags: ['tech'],
      likes_count: 5,
      comments_count: 2,
      shares_count: 1,
      views_count: 100,
      created_at: '2026-01-15T10:00:00Z',
      user_profile: {
        id: userId,
        username: 'user_' + userId.slice(-3),
        avatar: 'avatar.png',
        bio: 'bio text',
        first_name_encrypted: 'enc_first',
        last_name_encrypted: 'enc_last',
        has_completed_onboarding: true,
        is_company_verified: true,
      },
    };
  }

  function makeMockTopic(id: string, userId: string) {
    return {
      id,
      user_id: userId,
      forum_id: 'forum-1',
      title: 'Topic title ' + id,
      content: 'Topic content',
      is_anonymous: false,
      tags: ['career'],
      scope: 'global',
      company_name: null,
      views_count: 50,
      comments_count: 3,
      reaction_seen_count: 2,
      reaction_validated_count: 1,
      reaction_inspired_count: 1,
      reaction_heard_count: 0,
      created_at: '2026-01-14T10:00:00Z',
      user_profile: {
        id: userId,
        username: 'user_' + userId.slice(-3),
        avatar: 'avatar.png',
        bio: 'bio text',
        first_name_encrypted: 'enc_first',
        last_name_encrypted: 'enc_last',
        has_completed_onboarding: true,
        is_company_verified: false,
      },
      forum: { id: 'forum-1', name: 'General Discussion' },
    };
  }

  function makeMockNook(id: string, creatorId: string) {
    return {
      id,
      title: 'Nook ' + id,
      description: 'Nook description',
      creator_id: creatorId,
      urgency: 'medium',
      scope: 'global',
      temperature: 'cool',
      hashtags: ['networking'],
      members_count: 10,
      messages_count: 25,
      expires_at: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
      created_at: '2026-01-13T10:00:00Z',
      user_profile: {
        id: creatorId,
        username: 'user_' + creatorId.slice(-3),
        avatar: 'avatar.png',
        bio: 'bio text',
        first_name_encrypted: 'enc_first',
        last_name_encrypted: 'enc_last',
        has_completed_onboarding: true,
        is_company_verified: false,
      },
    };
  }

  /**
   * Helper: set up the default from() mocks for a simple single-content-type feed.
   * Returns the content chain so callers can inspect it.
   * After calling this, the default chain handles all remaining from() calls
   * (personalization signals, enrichment, etc.) with { data: null, error: null }.
   */
  function setupSingleContentFeed(
    tableName: string,
    data: any[],
  ) {
    const contentChain = createMockQueryChain({ data, error: null });
    mockClient.from.mockReturnValueOnce(contentChain);
    return contentChain;
  }

  describe('getAggregatedFeed', () => {
    it('should return mixed feed items from posts, topics, and nooks', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const postsChain = createMockQueryChain({
        data: [
          makeMockPost('post-1', 'user-a01'),
          makeMockPost('post-2', 'user-b02'),
        ],
        error: null,
      });
      const topicsChain = createMockQueryChain({
        data: [makeMockTopic('topic-1', 'user-c03')],
        error: null,
      });
      const nooksChain = createMockQueryChain({
        data: [makeMockNook('nook-1', 'user-d04')],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(postsChain);
      mockClient.from.mockReturnValueOnce(topicsChain);
      mockClient.from.mockReturnValueOnce(nooksChain);

      // enrichWithUserEngagement -> 3 always-queries: feed_likes, feed_shares, feed_bookmarks
      const likesChain = createMockQueryChain({ data: [], error: null });
      const sharesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(likesChain);
      mockClient.from.mockReturnValueOnce(sharesChain);
      mockClient.from.mockReturnValueOnce(bookmarksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(4);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.hasMore).toBe(false);

      expect(mockFeedRanking.rankByEngagement).toHaveBeenCalled();
      expect(mockIdentityReveal.getRevealedUserIds).toHaveBeenCalled();

      const contentTypes = result.data.map((item: any) => item.content_type);
      expect(contentTypes).toContain('post');
      expect(contentTypes).toContain('topic');
      expect(contentTypes).toContain('nook_message');
    });

    it('should return empty data when filter=FOLLOWING and user has no followers', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.FOLLOWING,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const followsChain = createMockQueryChain({
        data: [],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(followsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(mockClient.from).toHaveBeenCalledTimes(1);
      expect(mockClient.from).toHaveBeenCalledWith('user_follows');
    });

    it('should return empty data when filter=FOLLOWING and followingUsers is null', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.FOLLOWING,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const followsChain = createMockQueryChain({
        data: null,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(followsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('should handle pagination correctly on page 2', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.RECENT,
        page: 2,
        limit: 2,
      };

      const posts = [
        makeMockPost('post-1', 'user-a01'),
        makeMockPost('post-2', 'user-b02'),
        makeMockPost('post-3', 'user-c03'),
        makeMockPost('post-4', 'user-d04'),
      ];
      setupSingleContentFeed('feed_posts', posts);

      const result = await service.getAggregatedFeed(userId, queryDto);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.hasMore).toBe(false);
      expect(mockFeedRanking.rankByEngagement).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on database error', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      mockClient.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(service.getAggregatedFeed(userId, queryDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should call getUserCompanyList for COMPANY filter', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.COMPANY,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const profileChain = createMockQueryChain({
        data: { company_encrypted: 'enc_acme', company_alumni_encrypted: null },
        error: null,
      });
      const postsChain = createMockQueryChain({
        data: [makeMockPost('post-1', 'user-a01')],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_acme');
    });

    it('should decrypt alumni companies for COMPANY filter', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.COMPANY,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const profileChain = createMockQueryChain({
        data: {
          company_encrypted: 'enc_acme',
          company_alumni_encrypted: ['enc_prev1', 'enc_prev2'],
        },
        error: null,
      });
      const postsChain = createMockQueryChain({
        data: [],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      // decrypt called for current + 2 alumni = 3 calls
      expect(mockEncryption.decrypt).toHaveBeenCalledTimes(3);
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_acme');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_prev1');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_prev2');
    });

    it('should handle getUserCompanyList when profile is null', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.COMPANY,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const profileChain = createMockQueryChain({
        data: null,
        error: null,
      });
      const postsChain = createMockQueryChain({
        data: [],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockEncryption.decrypt).not.toHaveBeenCalled();
    });

    it('should return feed when FeedFilter.FOLLOWING has following users', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.FOLLOWING,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const followsChain = createMockQueryChain({
        data: [{ following_id: 'user-a01' }, { following_id: 'user-b02' }],
        error: null,
      });
      const postsChain = createMockQueryChain({
        data: [makeMockPost('post-1', 'user-a01')],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(followsChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(mockClient.from).toHaveBeenCalledWith('user_follows');
    });

    it('should use rankByTrending for TRENDING filter', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.TRENDING,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const postsChain = createMockQueryChain({
        data: [makeMockPost('post-1', 'user-a01')],
        error: null,
      });
      const topicsChain = createMockQueryChain({ data: [], error: null });
      const nooksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockFeedRanking.rankByTrending).toHaveBeenCalled();
      expect(mockFeedRanking.rankByEngagement).not.toHaveBeenCalled();
    });

    it('should apply seenIds suppression when seenIds provided', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
        seenIds: ['post-1'],
      };

      setupSingleContentFeed('feed_posts', [makeMockPost('post-1', 'user-a01')]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockFeedRanking.applySuppression).toHaveBeenCalled();
      const suppressionCall = mockFeedRanking.applySuppression.mock.calls[0];
      expect(suppressionCall[1]).toBeInstanceOf(Map);
      expect(suppressionCall[1].has('post-1')).toBe(true);
    });

    it('should not call applySuppression when seenIds is empty', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
        seenIds: [],
      };

      setupSingleContentFeed('feed_posts', [makeMockPost('post-1', 'user-a01')]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockFeedRanking.applySuppression).not.toHaveBeenCalled();
    });

    it('should filter out blocked users content', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      mockContentSafety.getBlockedUserIds.mockResolvedValue(['user-a01']);

      // Recreate service with updated mockContentSafety
      service = new FeedsService(
        mockConfig,
        mockFeedRanking,
        mockEncryption,
        mockIdentityReveal,
        mockRedis,
        mockContentSafety as any,
      );

      setupSingleContentFeed('feed_posts', [
        makeMockPost('post-1', 'user-a01'),
        makeMockPost('post-2', 'user-b02'),
      ]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.every((item: any) => item.user_id !== 'user-a01')).toBe(true);
      expect(result.data.length).toBe(1);
    });

    it('should filter out hidden content post-cache', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      // getHiddenContentIds is called 3 times (post, topic, nook)
      mockContentSafety.getHiddenContentIds
        .mockResolvedValueOnce(['post-1'])  // hidden post
        .mockResolvedValueOnce([])          // hidden topics
        .mockResolvedValueOnce([]);         // hidden nooks

      service = new FeedsService(
        mockConfig,
        mockFeedRanking,
        mockEncryption,
        mockIdentityReveal,
        mockRedis,
        mockContentSafety as any,
      );

      setupSingleContentFeed('feed_posts', [
        makeMockPost('post-1', 'user-a01'),
        makeMockPost('post-2', 'user-b02'),
      ]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      // post-1 is hidden, only post-2 should remain
      expect(result.data.length).toBe(1);
      expect(result.data[0].content_id).toBe('post-2');
    });

    it('should use cached feed from redis when available', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const cachedFeed = [
        {
          id: 'post_cached-1',
          content_type: 'post',
          content_id: 'cached-1',
          user_id: 'user-a01',
          author: {
            display_name: 'cached_user',
            username: 'cached_user',
            bio: null,
            avatar: 'User',
            first_name_encrypted: 'enc_first',
            last_name_encrypted: 'enc_last',
          },
          content: { text: 'Cached post' },
          engagement: { likes: 10, comments: 5, shares: 1, seen: 200 },
          created_at: '2026-01-15T10:00:00Z',
        },
      ];

      // First redis.get call is for the feed cache key — return cached data
      mockRedis.get.mockResolvedValueOnce(cachedFeed);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      // Should NOT have queried feed_posts since cache was hit
      expect(mockClient.from).not.toHaveBeenCalledWith('feed_posts');
      // Redis cache was read
      expect(mockRedis.get).toHaveBeenCalled();
      // Redis.set should NOT be called (no cache rebuild)
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should store built feed in redis cache', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      setupSingleContentFeed('feed_posts', [makeMockPost('post-1', 'user-a01')]);

      await service.getAggregatedFeed(userId, queryDto);

      // redis.set should have been called to cache the feed
      expect(mockRedis.set).toHaveBeenCalled();
      const setCalls = mockRedis.set.mock.calls;
      const feedCacheCall = setCalls.find((c: any) => c[0].startsWith('feeds:v2:'));
      expect(feedCacheCall).toBeDefined();
      expect(feedCacheCall[2]).toBe(120000); // TTL
    });

    it('should use GLOBAL filter and query global-scoped content', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.GLOBAL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const postsChain = createMockQueryChain({
        data: [makeMockPost('post-1', 'user-a01')],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      // Verify .eq('visibility', 'global') was called on the posts chain
      expect(postsChain.eq).toHaveBeenCalledWith('visibility', 'global');
    });

    it('should fetch only topics when contentType=TOPIC', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.TOPIC,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const topicsChain = createMockQueryChain({
        data: [makeMockTopic('topic-1', 'user-c03')],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(topicsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].content_type).toBe('topic');
      expect(result.data[0].content.title).toBe('Topic title topic-1');
      expect(result.data[0].content.forum_name).toBe('General Discussion');
      expect(result.data[0].reaction_counts).toEqual({
        seen: 2,
        validated: 1,
        inspired: 1,
        heard: 0,
      });
      // engagement.likes = totalReactions = 2+1+1+0 = 4
      expect(result.data[0].engagement.likes).toBe(4);
    });

    it('should fetch only nooks when contentType=NOOK', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.NOOK,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const nooksChain = createMockQueryChain({
        data: [makeMockNook('nook-1', 'user-d04')],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].content_type).toBe('nook_message');
      expect(result.data[0].content.nook_urgency).toBe('medium');
      expect(result.data[0].content.nook_scope).toBe('global');
      expect(result.data[0].content.nook_temperature).toBe('cool');
      expect(result.data[0].content.nook_members).toBe(10);
      expect(result.data[0].engagement.comments).toBe(25);
    });

    it('should use sortFeedItems for non-trending non-engagement sortBy (RECENT)', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.RECENT,
        page: 1,
        limit: 20,
      };

      const post1 = makeMockPost('post-1', 'user-a01');
      post1.created_at = '2026-01-10T10:00:00Z';
      const post2 = makeMockPost('post-2', 'user-b02');
      post2.created_at = '2026-01-15T10:00:00Z';

      setupSingleContentFeed('feed_posts', [post1, post2]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      // Should NOT use ranking service for RECENT sort
      expect(mockFeedRanking.rankByEngagement).not.toHaveBeenCalled();
      expect(mockFeedRanking.rankByTrending).not.toHaveBeenCalled();
      // Items should be sorted by created_at descending
      expect(result.data[0].content_id).toBe('post-2');
      expect(result.data[1].content_id).toBe('post-1');
    });

    it('should sort by MOST_LIKED (likes descending)', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.MOST_LIKED,
        page: 1,
        limit: 20,
      };

      const post1 = makeMockPost('post-1', 'user-a01');
      post1.likes_count = 3;
      const post2 = makeMockPost('post-2', 'user-b02');
      post2.likes_count = 10;

      setupSingleContentFeed('feed_posts', [post1, post2]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      // MOST_LIKED maps to engagement.likes sort; post-2 has more likes
      expect(result.data[0].content_id).toBe('post-2');
      expect(result.data[1].content_id).toBe('post-1');
    });

    it('should sort by MOST_COMMENTED (comments descending)', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.MOST_COMMENTED,
        page: 1,
        limit: 20,
      };

      const post1 = makeMockPost('post-1', 'user-a01');
      post1.comments_count = 1;
      const post2 = makeMockPost('post-2', 'user-b02');
      post2.comments_count = 20;

      setupSingleContentFeed('feed_posts', [post1, post2]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data[0].content_id).toBe('post-2');
      expect(result.data[1].content_id).toBe('post-1');
    });

    it('should apply identity reveals for revealed users', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      mockIdentityReveal.getRevealedUserIds.mockResolvedValue(
        new Set(['user-a01']),
      );
      mockIdentityReveal.decryptRealName.mockReturnValue('Alice Smith');

      setupSingleContentFeed('feed_posts', [makeMockPost('post-1', 'user-a01')]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      // The revealed user's display_name should be the decrypted real name
      expect(result.data[0].author.display_name).toBe('Alice Smith');
      // Encrypted fields should be stripped
      expect(result.data[0].author.first_name_encrypted).toBeUndefined();
      expect(result.data[0].author.last_name_encrypted).toBeUndefined();
      expect(result.data[0].is_anonymous).toBeUndefined();
    });

    it('should not reveal identity for non-revealed users', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      // No users are revealed
      mockIdentityReveal.getRevealedUserIds.mockResolvedValue(new Set());
      mockIdentityReveal.decryptRealName.mockReturnValue(null);

      setupSingleContentFeed('feed_posts', [makeMockPost('post-1', 'user-a01')]);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      // display_name should remain as the username, not a decrypted name
      expect(result.data[0].author.display_name).toBe('user_a01');
      // Encrypted fields still stripped by cleanup
      expect(result.data[0].author.first_name_encrypted).toBeUndefined();
    });

    it('should handle company param in queryDto triggering getUserCompanyList', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
        company: 'Acme Inc',
      };

      // company param triggers getUserCompanyList even without COMPANY filter
      const profileChain = createMockQueryChain({
        data: { company_encrypted: 'enc_acme', company_alumni_encrypted: null },
        error: null,
      });
      const postsChain = createMockQueryChain({
        data: [makeMockPost('post-1', 'user-a01')],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
      // posts chain should have company_name filter
      expect(postsChain.eq).toHaveBeenCalledWith('company_name', 'Acme Inc');
    });

    it('should handle FOLLOWING with ALL content types', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.FOLLOWING,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const followsChain = createMockQueryChain({
        data: [{ following_id: 'user-a01' }],
        error: null,
      });
      const postsChain = createMockQueryChain({
        data: [makeMockPost('post-1', 'user-a01')],
        error: null,
      });
      const topicsChain = createMockQueryChain({ data: [], error: null });
      const nooksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(followsChain)
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(mockClient.from).toHaveBeenCalledWith('user_follows');
      expect(mockClient.from).toHaveBeenCalledWith('feed_posts');
      expect(mockClient.from).toHaveBeenCalledWith('forum_topics');
      expect(mockClient.from).toHaveBeenCalledWith('nooks');
    });

    it('should handle getFeedPosts returning error gracefully', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      // Feed posts returns an error — the service should return empty for that content type
      const postsChain = createMockQueryChain({
        data: null,
        error: { message: 'Query failed' },
      });
      mockClient.from.mockReturnValueOnce(postsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle getForumTopics returning error gracefully', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.TOPIC,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const topicsChain = createMockQueryChain({
        data: null,
        error: { message: 'Query failed' },
      });
      mockClient.from.mockReturnValueOnce(topicsChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle getNookMessages returning error gracefully', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.NOOK,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const nooksChain = createMockQueryChain({
        data: null,
        error: { message: 'Query failed' },
      });
      mockClient.from.mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should enrich feed with user engagement data (likes, shares, bookmarks)', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      // Use table-name-based dispatch to handle parallel from() calls reliably
      const likesData = [{ content_type: 'post', content_id: 'post-1' }];
      const sharesData = [{ content_type: 'post', content_id: 'post-1' }];
      const feedUserReactionsData = [
        { content_type: 'post', content_id: 'post-1', reaction_type: 'heard' },
      ];
      const feedAllReactionsData = [
        { content_type: 'post', content_id: 'post-1', reaction_type: 'heard' },
        { content_type: 'post', content_id: 'post-1', reaction_type: 'validated' },
      ];

      // Track how many times each table is called
      const feedLikesCalls: number[] = [];
      const feedReactionsCalls: number[] = [];

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'feed_posts') {
          return createMockQueryChain({
            data: [makeMockPost('post-1', 'user-a01')],
            error: null,
          });
        }
        if (table === 'feed_likes') {
          feedLikesCalls.push(1);
          return createMockQueryChain({ data: likesData, error: null });
        }
        if (table === 'feed_shares') {
          return createMockQueryChain({ data: sharesData, error: null });
        }
        if (table === 'feed_bookmarks') {
          return createMockQueryChain({ data: [], error: null });
        }
        if (table === 'feed_reactions') {
          feedReactionsCalls.push(1);
          // First call = user reactions, second = all reactions
          if (feedReactionsCalls.length <= 2) {
            return createMockQueryChain({ data: feedUserReactionsData, error: null });
          }
          return createMockQueryChain({ data: feedAllReactionsData, error: null });
        }
        if (table === 'feed_comments') {
          return createMockQueryChain({ data: [], error: null });
        }
        // Default for any other table
        return createMockQueryChain({ data: [], error: null });
      });

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      const item = result.data[0];
      expect(item.user_liked).toBe(true);
      expect(item.user_shared).toBe(true);
      expect(item.user_bookmarked).toBe(false);
      expect(item.user_reactions.heard).toBe(true);
    });

    it('should enrich topics with topic-specific reactions', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.TOPIC,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const topicReactionsData = [
        { topic_id: 'topic-1', reaction_type: 'seen' },
        { topic_id: 'topic-1', reaction_type: 'validated' },
      ];

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'forum_topics') {
          return createMockQueryChain({
            data: [makeMockTopic('topic-1', 'user-c03')],
            error: null,
          });
        }
        if (table === 'topic_reactions') {
          return createMockQueryChain({ data: topicReactionsData, error: null });
        }
        // Default for feed_likes, feed_shares, feed_bookmarks, feed_comments, etc.
        return createMockQueryChain({ data: [], error: null });
      });

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      const item = result.data[0];
      expect(item.user_reactions.seen).toBe(true);
      expect(item.user_reactions.validated).toBe(true);
      expect(item.user_reactions.inspired).toBe(false);
      expect(item.user_reactions.heard).toBe(false);
    });

    it('should return empty enrichment when items list is empty', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      setupSingleContentFeed('feed_posts', []);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      // enrichWithUserEngagement should short-circuit for empty items
    });

    it('should use default queryDto values when none provided', async () => {
      const userId = 'user-123';
      const queryDto = {} as any;

      // Default: filter=ALL, contentType=ALL, sortBy=ENGAGEMENT, page=1, limit=20
      const postsChain = createMockQueryChain({ data: [], error: null });
      const topicsChain = createMockQueryChain({ data: [], error: null });
      const nooksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(postsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should handle nook with array user_profile', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.NOOK,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const nookData = makeMockNook('nook-1', 'user-d04');
      // Sometimes Supabase returns user_profile as array
      (nookData as any).user_profile = [nookData.user_profile];

      const nooksChain = createMockQueryChain({
        data: [nookData],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data[0].author.display_name).toBe('user_d04');
    });

    it('should handle nook with expired time showing correct time left', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.NOOK,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const nookData = makeMockNook('nook-1', 'user-d04');
      // Set expires_at to the past
      nookData.expires_at = new Date(Date.now() - 1000).toISOString();

      const nooksChain = createMockQueryChain({
        data: [nookData],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data[0].content.nook_time_left).toBe('Expired');
    });

    it('should handle nook with null expires_at', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.NOOK,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      const nookData = makeMockNook('nook-1', 'user-d04');
      nookData.expires_at = null as any;

      const nooksChain = createMockQueryChain({
        data: [nookData],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(nooksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(result.data[0].content.nook_time_left).toBe('N/A');
    });

    it('should apply diversity constraints on the feed', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.ALL,
        contentType: ContentTypeFilter.POST,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 2,
      };

      const posts = [
        makeMockPost('post-1', 'user-a01'),
        makeMockPost('post-2', 'user-b02'),
        makeMockPost('post-3', 'user-c03'),
      ];
      setupSingleContentFeed('feed_posts', posts);

      const result = await service.getAggregatedFeed(userId, queryDto);
      expect(result.success).toBe(true);
      expect(mockFeedRanking.applyDiversityConstraints).toHaveBeenCalled();
      // limit=2, page=1: totalNeeded = 0 + 2 = 2
      const diversityCall = mockFeedRanking.applyDiversityConstraints.mock.calls[0];
      expect(diversityCall[1]).toBe(2);
    });
  });
});
