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
import { FeedPostsService } from '../../modules/feeds/services/feed-posts.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('FeedPostsService', () => {
  let service: FeedPostsService;
  let mockClient: any;

  const mockPost = {
    id: 'post-1',
    user_id: 'u1',
    content: 'Hello world',
    visibility: 'global',
    is_anonymous: false,
    tags: ['tech'],
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
    views_count: 0,
    created_at: '2026-05-01',
    user_profile: {
      id: 'u1',
      username: 'TestUser',
      avatar: '🔥',
      bio: 'hi',
      is_company_verified: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    const mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
    };
    const mockEncryption = {
      encrypt: jest.fn((v) => v + '_enc'),
      decrypt: jest.fn((v) => v + '_dec'),
    };
    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue([]),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockMentionService = {
      parseMentions: jest.fn().mockReturnValue([]),
      processMentions: jest.fn(),
    };
    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    service = new FeedPostsService(
      createMockConfigService() as any,
      mockRedis,
      mockEncryption,
      mockIdentityReveal,
      mockMentionService,
      mockNotifications,
    );
  });

  describe('createPost', () => {
    it('should create a global post', async () => {
      const insertChain = createMockQueryChain({ data: mockPost, error: null });
      mockClient.from.mockReturnValue(insertChain);

      const result = await service.createPost('u1', {
        content: 'Hello world',
        tags: ['tech'],
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.POST_CREATED);
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createPost('u1', { content: 'Hi' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should stamp company on company-scoped posts', async () => {
      const profileChain = createMockQueryChain({
        data: { company_encrypted: 'enc_Google' },
        error: null,
      });
      const insertChain = createMockQueryChain({ data: mockPost, error: null });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createPost('u1', {
        content: 'Hi',
        visibility: 'company',
      } as any);
      expect(result.success).toBe(true);
    });
  });

  describe('updatePost', () => {
    it('should update own post', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'u1' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { ...mockPost, content: 'Updated' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updatePost('post-1', 'u1', {
        content: 'Updated',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.POST_UPDATED);
    });

    it('should throw if not post owner', async () => {
      const chain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.updatePost('post-1', 'u1', { content: 'Hack' } as any),
      ).rejects.toThrow();
    });

    it('should throw if post not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.updatePost('nope', 'u1', {} as any),
      ).rejects.toThrow();
    });
  });

  describe('deletePost', () => {
    it('should delete own post', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'u1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.deletePost('post-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FEED.POST_DELETED);
    });

    it('should throw if not post owner', async () => {
      const chain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deletePost('post-1', 'u1')).rejects.toThrow();
    });
  });

  describe('pinPost', () => {
    it('should pin own post', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'u1' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.pinPost('post-1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw if not post owner', async () => {
      const chain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.pinPost('post-1', 'u1')).rejects.toThrow();
    });
  });

  describe('unpinPost', () => {
    it('should unpin own post', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'post-1', user_id: 'u1' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.unpinPost('post-1', 'u1');
      expect(result.success).toBe(true);
    });
  });
});
