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

import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { TopicService } from '../../modules/forum/services/topic.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('TopicService', () => {
  let service: TopicService;
  let mockClient: any;

  const mockTopic = {
    id: 't1',
    user_id: 'u1',
    forum_id: 'f1',
    title: 'Test Topic',
    content: 'Content here',
    scope: 'global',
    is_anonymous: false,
    tags: ['tech'],
    views_count: 0,
    comments_count: 0,
    created_at: '2026-05-01',
    user_profile: { id: 'u1', username: 'User1', avatar: '🔥' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };
    const mockEncryption = {
      encrypt: jest.fn((v) => v + '_enc'),
      decrypt: jest.fn((v) => v + '_dec'),
    };
    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
      decryptRealName: jest.fn().mockReturnValue(null),
    };
    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
    };
    const mockOkestra = {
      generateTopicSuggestions: jest.fn().mockResolvedValue([]),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };
    const mockContentSafety = {
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getHiddenContentIds: jest.fn().mockResolvedValue([]),
    };
    const mockModerationQueue = { add: jest.fn().mockResolvedValue({}) };

    service = new TopicService(
      createMockConfigService() as any,
      mockNotifications,
      mockEncryption,
      mockIdentityReveal,
      mockRedis,
      mockOkestra,
      mockContentSafety,
      mockModerationQueue as any,
    );
  });

  describe('createTopic', () => {
    it('should create a topic in a forum', async () => {
      const forumChain = createMockQueryChain({
        data: { id: 'f1', name: 'Tech Forum', is_global: false, topic_count: 0 },
        error: null,
      });
      const memberChain = createMockQueryChain({
        data: { id: 'member-1' },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: mockTopic,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createTopic(
        { forumId: 'f1', title: 'Test Topic', content: 'Content' } as any,
        'u1',
      );
      expect(result.id).toBe('t1');
    });

    it('should throw if forum not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createTopic(
          { forumId: 'nope', title: 'T', content: 'C' } as any,
          'u1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not forum member', async () => {
      const forumChain = createMockQueryChain({
        data: { id: 'f1', name: 'Tech', is_global: false },
        error: null,
      });
      const memberChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberChain);

      await expect(
        service.createTopic(
          { forumId: 'f1', title: 'T', content: 'C' } as any,
          'u1',
        ),
      ).rejects.toThrow();
    });

    it('should throw on insert error', async () => {
      const forumChain = createMockQueryChain({
        data: { id: 'f1', is_global: false },
        error: null,
      });
      const memberChain = createMockQueryChain({
        data: { id: 'm1' },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.createTopic(
          { forumId: 'f1', title: 'T', content: 'C' } as any,
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findTopicById', () => {
    it('should return topic with reactions', async () => {
      const viewsChain = createMockQueryChain({
        data: { views_count: 0 },
        error: null,
      });
      const topicChain = createMockQueryChain({
        data: { ...mockTopic, forum_comments: [] },
        error: null,
      });
      const reactionsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(viewsChain)
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(reactionsChain);

      const result = await service.findTopicById('t1', 'u1');
      expect(result.id).toBe('t1');
    });

    it('should throw if topic not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found', code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findTopicById('nope', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllTopics', () => {
    it('should return paginated topics', async () => {
      const chain = createMockQueryChain({
        data: [mockTopic],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAllTopics(
        { page: 1, limit: 10 } as any,
        'u1',
      );
      expect(result.data).toBeDefined();
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAllTopics(
        { page: 1, limit: 10 } as any,
        'u1',
      );
      expect(result.data).toBeDefined();
    });

    it('should filter by forumId', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.findAllTopics(
        { page: 1, limit: 10, forumId: 'f1' } as any,
        'u1',
      );
      expect(chain.eq).toHaveBeenCalledWith('forum_id', 'f1');
    });
  });

  describe('addReaction', () => {
    it('should add reaction to topic', async () => {
      const topicChain = createMockQueryChain({
        data: { ...mockTopic, user_id: 'u2' },
        error: null,
      });
      const upsertChain = createMockQueryChain({
        data: { id: 'r1' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(upsertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.addReaction('t1', 'u1', 'validated');
      expect(result.action).toBe('added');
    });

    it('should throw if topic not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.addReaction('nope', 'u1', 'validated'),
      ).rejects.toThrow();
    });
  });

  describe('deleteTopic', () => {
    it('should delete own topic', async () => {
      const topicChain = createMockQueryChain({
        data: { id: 't1', user_id: 'u1', forum_id: 'f1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.deleteTopic('t1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw if not topic owner', async () => {
      const chain = createMockQueryChain({
        data: { id: 't1', user_id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteTopic('t1', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('toggleTopicBookmark', () => {
    it('should add bookmark', async () => {
      const topicChain = createMockQueryChain({ data: mockTopic, error: null });
      const existsChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.toggleTopicBookmark('t1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FORUM.BOOKMARKED);
    });

    it('should remove bookmark', async () => {
      const topicChain = createMockQueryChain({ data: mockTopic, error: null });
      const existsChain = createMockQueryChain({
        data: { id: 'b1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.toggleTopicBookmark('t1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FORUM.BOOKMARK_REMOVED);
    });
  });

  describe('getMyTopics', () => {
    it('should return topics created by the user', async () => {
      const chain = createMockQueryChain({
        data: [{ id: 't1', user_id: 'u1', title: 'My Topic', forum: { id: 'f1', name: 'Forum 1' }, user_profile: { id: 'u1', username: 'User1', avatar: '🔥', bio: null, first_name_encrypted: null, last_name_encrypted: null, is_company_verified: true } }],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getMyTopics('u1');
      expect(result.success).toBe(true);
      expect(result.data.topics).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getMyTopics('u1');
      expect(result.success).toBe(true);
      expect(result.data.topics).toHaveLength(0);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getMyTopics('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBookmarkedTopics', () => {
    it('should return bookmarked topics', async () => {
      const bookmarksChain = createMockQueryChain({
        data: [{ content_id: 't1' }, { content_id: 't2' }],
        error: null,
      });
      const topicsChain = createMockQueryChain({
        data: [{ id: 't1', title: 'Topic 1' }, { id: 't2', title: 'Topic 2' }],
        error: null,
        count: 2,
      });

      mockClient.from
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(topicsChain);

      const result = await service.getBookmarkedTopics('u1');
      expect(result.success).toBe(true);
    });

    it('should return empty when no bookmarks', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getBookmarkedTopics('u1');
      expect(result.success).toBe(true);
      expect(result.data.topics).toHaveLength(0);
    });
  });

  describe('findRecentDiscussions', () => {
    it('should return empty when no forums found', async () => {
      // getUserCompanyList: from('user_profiles')
      const profileChain = createMockQueryChain({ data: { company_encrypted: null, company_alumni_encrypted: null }, error: null });
      // from('forums') - returns no forums
      const forumsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(forumsChain);

      const result = await service.findRecentDiscussions({} as any, 'u1');
      expect(result.topics).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should return topics when forums exist', async () => {
      // getUserCompanyList: from('user_profiles')
      const profileChain = createMockQueryChain({ data: { company_encrypted: null, company_alumni_encrypted: null }, error: null });
      // from('forums')
      const forumsChain = createMockQueryChain({ data: [{ id: 'f1' }], error: null });
      // from('forum_topics')
      const topicsChain = createMockQueryChain({
        data: [
          {
            id: 't1',
            user_id: 'u2',
            forum_id: 'f1',
            title: 'Topic 1',
            content: 'Content',
            is_anonymous: false,
            tags: [],
            comments_count: 5,
            reaction_seen_count: 1,
            reaction_validated_count: 0,
            reaction_inspired_count: 0,
            reaction_heard_count: 0,
            user_profile: { id: 'u2', username: 'User2', avatar: null, first_name_encrypted: null, last_name_encrypted: null, is_company_verified: false },
            forum: { id: 'f1', name: 'Forum 1' },
          },
        ],
        error: null,
        count: 1,
      });
      // from('topic_reactions')
      const reactionsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(forumsChain)
        .mockReturnValueOnce(topicsChain)
        .mockReturnValueOnce(reactionsChain);

      const result = await service.findRecentDiscussions({} as any, 'u1');
      expect(result.topics).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty topics when query returns none', async () => {
      const profileChain = createMockQueryChain({ data: null, error: null });
      const forumsChain = createMockQueryChain({ data: [{ id: 'f1' }], error: null });
      const topicsChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(forumsChain)
        .mockReturnValueOnce(topicsChain);

      const result = await service.findRecentDiscussions({} as any, 'u1');
      expect(result.topics).toHaveLength(0);
    });

    it('should throw BadRequestException on forums query error', async () => {
      const profileChain = createMockQueryChain({ data: null, error: null });
      const forumsChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(forumsChain);

      await expect(service.findRecentDiscussions({} as any, 'u1')).rejects.toThrow();
    });

    it('should apply search and hashtag filters', async () => {
      const profileChain = createMockQueryChain({ data: null, error: null });
      const forumsChain = createMockQueryChain({ data: [{ id: 'f1' }], error: null });
      const topicsChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(forumsChain)
        .mockReturnValueOnce(topicsChain);

      const result = await service.findRecentDiscussions(
        { search: 'react', hashtag: 'tech', timeFilter: 'week' } as any,
        'u1',
      );
      expect(result.topics).toHaveLength(0);
    });
  });
});
