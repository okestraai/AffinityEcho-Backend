import { BadRequestException } from '@nestjs/common';
import { FeedsService } from './feeds.service';
import { supabaseAdmin } from '../../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../../__tests__/helpers/mock-supabase';
import {
  FeedFilter,
  FeedSortBy,
  ContentTypeFilter,
} from '../dto/query-feed.dto';

jest.mock('../../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.mock('../../../common/utils/logger.util', () => ({
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

    const mockContentSafety = {
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
      },
    };
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

      // For ContentTypeFilter.ALL, three parallel queries are made:
      // 1. getFeedPosts -> from('feed_posts')
      // 2. getForumTopics -> from('forum_topics')
      // 3. getNookMessages -> from('nooks')
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

      // enrichWithUserEngagement -> 3 parallel queries: feed_likes, feed_shares, feed_bookmarks
      const likesChain = createMockQueryChain({ data: [], error: null });
      const sharesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(likesChain);
      mockClient.from.mockReturnValueOnce(sharesChain);
      mockClient.from.mockReturnValueOnce(bookmarksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(4); // 2 posts + 1 topic + 1 nook
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.hasMore).toBe(false);

      // Verify ranking was called with engagement sort
      expect(mockFeedRanking.rankByEngagement).toHaveBeenCalled();

      // Verify identity reveal was invoked
      expect(mockIdentityReveal.getRevealedUserIds).toHaveBeenCalled();

      // Check that content types are present
      const contentTypes = result.data.map((item: any) => item.content_type);
      expect(contentTypes).toContain('post');
      expect(contentTypes).toContain('topic');
      expect(contentTypes).toContain('nook_message');
    });

    it('should return empty data when filter=following and user has no following', async () => {
      const userId = 'user-123';
      const queryDto = {
        filter: FeedFilter.FOLLOWING,
        contentType: ContentTypeFilter.ALL,
        sortBy: FeedSortBy.ENGAGEMENT,
        page: 1,
        limit: 20,
      };

      // Following query: from('user_follows').select('following_id').eq('follower_id', userId)
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

      // Should NOT have queried feed_posts, forum_topics, or nooks
      // Only user_follows was queried
      expect(mockClient.from).toHaveBeenCalledTimes(1);
      expect(mockClient.from).toHaveBeenCalledWith('user_follows');
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

      // For ContentTypeFilter.POST, only getFeedPosts is called
      // Create 4 mock posts so we can test that page 2 slices correctly
      const posts = [
        makeMockPost('post-1', 'user-a01'),
        makeMockPost('post-2', 'user-b02'),
        makeMockPost('post-3', 'user-c03'),
        makeMockPost('post-4', 'user-d04'),
      ];
      const postsChain = createMockQueryChain({
        data: posts,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(postsChain);

      // enrichWithUserEngagement -> 3 parallel queries
      const likesChain = createMockQueryChain({ data: [], error: null });
      const sharesChain = createMockQueryChain({ data: [], error: null });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(likesChain);
      mockClient.from.mockReturnValueOnce(sharesChain);
      mockClient.from.mockReturnValueOnce(bookmarksChain);

      const result = await service.getAggregatedFeed(userId, queryDto);

      expect(result.success).toBe(true);
      // page 2, limit 2: offset = (2-1)*2 = 2, so items[2..3]
      expect(result.data.length).toBe(2);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.total).toBe(4);
      expect(result.pagination.hasMore).toBe(false); // 2 + 2 = 4, not < 4

      // feedRanking should NOT have been called since sortBy is RECENT, not ENGAGEMENT
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

      // Simulate an error from one of the queries — make from() throw
      mockClient.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(service.getAggregatedFeed(userId, queryDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
