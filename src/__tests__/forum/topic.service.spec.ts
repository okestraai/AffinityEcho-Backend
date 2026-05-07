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
    };
    service = new TopicService(
      createMockConfigService() as any,
      mockNotifications,
      mockEncryption,
      mockIdentityReveal,
      mockRedis,
      mockOkestra,
    );
  });

  describe('createTopic', () => {
    it.skip('should create a topic in a forum', async () => {
      const forumChain = createMockQueryChain({
        data: { id: 'f1', name: 'Tech Forum' },
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

      const result = await service.createTopic('u1', {
        forumId: 'f1',
        title: 'Test Topic',
        content: 'Content',
      } as any);
      expect(result.success).toBe(true);
    });

    it('should throw if forum not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createTopic('u1', {
          forumId: 'nope',
          title: 'T',
          content: 'C',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not forum member', async () => {
      const forumChain = createMockQueryChain({
        data: { id: 'f1', name: 'Tech' },
        error: null,
      });
      const memberChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(forumChain)
        .mockReturnValueOnce(memberChain);

      await expect(
        service.createTopic('u1', {
          forumId: 'f1',
          title: 'T',
          content: 'C',
        } as any),
      ).rejects.toThrow();
    });

    it('should throw on insert error', async () => {
      const forumChain = createMockQueryChain({
        data: { id: 'f1' },
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
        service.createTopic('u1', {
          forumId: 'f1',
          title: 'T',
          content: 'C',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findTopicById', () => {
    it.skip('should return topic with reactions', async () => {
      const topicChain = createMockQueryChain({ data: mockTopic, error: null });
      const reactionsChain = createMockQueryChain({ data: [], error: null });
      const userReactionsChain = createMockQueryChain({
        data: [],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(reactionsChain)
        .mockReturnValueOnce(userReactionsChain);

      const result = await service.findTopicById('t1', 'u1');
      expect(result.success).toBe(true);
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
    it.skip('should return paginated topics', async () => {
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
      expect(result.success).toBe(true);
    });

    it.skip('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAllTopics(
        { page: 1, limit: 10 } as any,
        'u1',
      );
      expect(result.success).toBe(true);
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
    it.skip('should add reaction to topic', async () => {
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

      const result = await service.addReaction('u1', 't1', 'validated');
      expect(result.success).toBe(true);
    });

    it('should throw if topic not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.addReaction('u1', 'nope', 'validated'),
      ).rejects.toThrow();
    });
  });

  describe('deleteTopic', () => {
    it.skip('should delete own topic', async () => {
      const topicChain = createMockQueryChain({
        data: { id: 't1', user_id: 'u1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.deleteTopic('u1', 't1');
      expect(result.success).toBe(true);
    });

    it('should throw if not topic owner', async () => {
      const chain = createMockQueryChain({
        data: { id: 't1', user_id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteTopic('u1', 't1')).rejects.toThrow(
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

      const result = await service.toggleTopicBookmark('u1', 't1');
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

      const result = await service.toggleTopicBookmark('u1', 't1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FORUM.BOOKMARK_REMOVED);
    });
  });
});
