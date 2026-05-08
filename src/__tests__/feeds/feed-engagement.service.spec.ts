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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeedEngagementService } from '../../modules/feeds/services/feed-engagement.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('FeedEngagementService', () => {
  let service: FeedEngagementService;
  let mockClient: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
    };
    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };
    const mockEncryption = {
      encrypt: jest.fn((v) => v + '_enc'),
      decrypt: jest.fn((v) => v + '_dec'),
    };
    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockContentSafety = {
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getHiddenContentIds: jest.fn().mockResolvedValue([]),
    };

    service = new FeedEngagementService(
      createMockConfigService() as any,
      mockNotifications,
      mockRedis,
      mockEncryption,
      mockIdentityReveal,
      mockContentSafety,
    );
  });

  describe('toggleLike', () => {
    it.skip('should like content when not already liked', async () => {
      const existChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const authorChain = createMockQueryChain({
        data: { user_id: 'u2', username: 'Author' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(existChain) // check existing
        .mockReturnValueOnce(insertChain) // insert like
        .mockReturnValueOnce(updateChain) // increment count
        .mockReturnValueOnce(authorChain); // notification

      const result = await service.toggleLike('post', 'p1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.liked).toBe(true);
      expect(result.message).toBe(MSG.FEED.LIKED);
    });

    it.skip('should unlike content when already liked', async () => {
      const existChain = createMockQueryChain({
        data: { id: 'like-1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.toggleLike('post', 'p1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.liked).toBe(false);
      expect(result.message).toBe(MSG.FEED.UNLIKED);
    });

    it.skip('should throw on error', async () => {
      const errorChain = createMockQueryChain({ data: null, error: null });
      errorChain.maybeSingle = jest
        .fn()
        .mockRejectedValue(new Error('DB fail'));
      mockClient.from.mockReturnValue(errorChain);

      await expect(service.toggleLike('post', 'p1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('toggleReaction', () => {
    it.skip('should add reaction when not reacted', async () => {
      const existChain = createMockQueryChain({ data: null, error: null });
      const defaultChain = createMockQueryChain({
        data: [],
        error: null,
        count: 0,
      });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValue(defaultChain);

      const result = await service.toggleReaction(
        'post',
        'p1',
        'u1',
        'validated',
      );
      expect(result.success).toBe(true);
      expect(result.data.reacted).toBe(true);
    });

    it.skip('should remove reaction when already reacted', async () => {
      const existChain = createMockQueryChain({
        data: { id: 'r1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const countChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(countChain);

      const result = await service.toggleReaction(
        'post',
        'p1',
        'u1',
        'validated',
      );
      expect(result.success).toBe(true);
      expect(result.data.reacted).toBe(false);
    });

    it.skip('should reject invalid reaction type', async () => {
      await expect(
        service.toggleReaction('post', 'p1', 'u1', 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleBookmark', () => {
    it.skip('should add bookmark', async () => {
      const existChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.toggleBookmark('post', 'p1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.BOOKMARKED);
    });

    it.skip('should remove bookmark', async () => {
      const existChain = createMockQueryChain({
        data: { id: 'b1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.toggleBookmark('post', 'p1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.BOOKMARK_REMOVED);
    });
  });

  describe('addComment', () => {
    it.skip('should add comment to post', async () => {
      const postChain = createMockQueryChain({
        data: { id: 'p1', user_id: 'u2', comments_count: 0 },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: { id: 'c1', content: 'Nice', created_at: '2026-05-01' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { username: 'Commenter', avatar: '🔥' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(postChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.addComment('post', 'p1', 'u1', {
        content: 'Nice',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.COMMENT_ADDED);
    });

    it.skip('should throw on insert error', async () => {
      const postChain = createMockQueryChain({
        data: { id: 'p1', user_id: 'u2', comments_count: 0 },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });

      mockClient.from
        .mockReturnValueOnce(postChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.addComment('post', 'p1', 'u1', { content: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBookmarks', () => {
    it.skip('should return user bookmarks', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            id: 'b1',
            content_type: 'post',
            content_id: 'p1',
            created_at: '2026-05-01',
          },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getUserBookmarks('u1', 1, 20);
      expect(result.success).toBe(true);
    });

    it.skip('should handle empty bookmarks', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getUserBookmarks('u1', 1, 20);
      expect(result.success).toBe(true);
    });
  });

  describe('toggleShare', () => {
    it.skip('should share content', async () => {
      const existChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.unshareItem('post', 'p1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.SHARED);
    });

    it.skip('should unshare via unshareItem', async () => {
      const existChain = createMockQueryChain({
        data: { id: 's1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.unshareItem('post', 'p1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.UNSHARED);
    });

    it.skip('should throw on error', async () => {
      const errorChain = createMockQueryChain({ data: null, error: null });
      errorChain.maybeSingle = jest
        .fn()
        .mockRejectedValue(new Error('DB fail'));
      mockClient.from.mockReturnValue(errorChain);

      await expect(
        service.shareItem('post', 'p1', 'u1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
