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
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CommentService } from '../../modules/forum/services/comment.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('CommentService', () => {
  let service: CommentService;
  let mockClient: any;

  const mockComment = {
    id: 'c1',
    user_id: 'u1',
    content: 'Great topic',
    is_anonymous: false,
    created_at: '2026-05-01',
    updated_at: '2026-05-01',
    parent_comment_id: null,
    topic_id: 't1',
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
      decryptRealName: jest.fn().mockReturnValue(null),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockMentionService = {
      parseMentions: jest.fn().mockReturnValue([]),
      processMentions: jest.fn(),
    };
    const mockOkestra = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };
    const mockContentSafety = {
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getHiddenContentIds: jest.fn().mockResolvedValue([]),
    };

    service = new CommentService(
      createMockConfigService() as any,
      mockNotifications,
      mockEncryption,
      mockIdentityReveal,
      mockMentionService,
      mockOkestra,
      mockContentSafety,
    );
  });

  describe('createComment', () => {
    it.skip('should create a comment on a topic', async () => {
      const topicChain = createMockQueryChain({
        data: {
          id: 't1',
          forum_id: 'f1',
          comments_count: 0,
          user_id: 'u2',
          title: 'Test',
        },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: mockComment,
        error: null,
      });
      const updateTopicChain = createMockQueryChain({
        data: null,
        error: null,
      });
      const profileChain = createMockQueryChain({
        data: { username: 'Commenter', avatar: '🔥' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateTopicChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.createComment(
        { topicId: 't1', content: 'Great topic', isAnonymous: false } as any,
        'u1',
      );
      expect(result.success).toBe(true);
    });

    it('should throw if topic not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createComment({ topicId: 'nope', content: 'Hi' } as any, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if parent comment not found', async () => {
      const topicChain = createMockQueryChain({
        data: {
          id: 't1',
          forum_id: 'f1',
          comments_count: 0,
          user_id: 'u2',
          title: 'Test',
        },
        error: null,
      });
      const parentChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(parentChain);

      await expect(
        service.createComment(
          { topicId: 't1', parentCommentId: 'bad', content: 'Hi' } as any,
          'u1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw on insert error', async () => {
      const topicChain = createMockQueryChain({
        data: {
          id: 't1',
          forum_id: 'f1',
          comments_count: 0,
          user_id: 'u2',
          title: 'Test',
        },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });

      mockClient.from
        .mockReturnValueOnce(topicChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.createComment({ topicId: 't1', content: 'Hi' } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteComment', () => {
    it('should delete own comment', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'c1', user_id: 'u1', topic_id: 't1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.deleteComment('c1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FORUM.COMMENT_DELETED);
    });

    it('should throw if comment not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteComment('nope', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if not comment owner', async () => {
      const chain = createMockQueryChain({
        data: { id: 'c1', user_id: 'other', topic_id: 't1' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteComment('c1', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('addReaction', () => {
    it.skip('should add reaction to comment', async () => {
      const commentChain = createMockQueryChain({
        data: { id: 'c1', user_id: 'u2', topic_id: 't1' },
        error: null,
      });
      const existChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(commentChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.addCommentReaction('u1', 'c1', 'helpful');
      expect(result.success).toBe(true);
    });

    it('should throw if comment not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.addCommentReaction('u1', 'nope', 'helpful'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
