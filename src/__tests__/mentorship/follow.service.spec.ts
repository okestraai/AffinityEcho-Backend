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

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FollowService } from '../../modules/mentorship/services/follow.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('FollowService', () => {
  let service: FollowService;
  let mockClient: any;
  let mockNotifications: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockNotifications = { createNotification: jest.fn().mockResolvedValue({}) };
    mockEncryption = {
      decrypt: jest.fn((v: string) => v + '_decrypted'),
      encrypt: jest.fn((v: string) => v + '_enc'),
    };
    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue([]),
    };
    service = new FollowService(
      createMockConfigService() as any,
      mockNotifications,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('followUser', () => {
    it('should follow user successfully', async () => {
      const followerChain = createMockQueryChain({
        data: { id: 'u1', username: 'Follower' },
        error: null,
      });
      const followingChain = createMockQueryChain({
        data: { id: 'u2', username: 'Following' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: { is_deleted: false, is_deactivated: false },
        error: null,
      });
      const upsertChain = createMockQueryChain({
        data: { id: 'follow-1' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(upsertChain);

      const result = await service.followUser('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FOLLOW.FOLLOWED);
    });

    it('should throw if follower not found', async () => {
      const followerChain = createMockQueryChain({ data: null, error: null });
      const followingChain = createMockQueryChain({
        data: { id: 'u2', username: 'Following' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(followingChain);

      await expect(service.followUser('u1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if target not found', async () => {
      const followerChain = createMockQueryChain({
        data: { id: 'u1', username: 'Follower' },
        error: null,
      });
      const followingChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(followingChain);

      await expect(service.followUser('u1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if following self', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', username: 'User' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: { is_deleted: false, is_deactivated: false },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(targetChain);

      await expect(service.followUser('u1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if target is deactivated', async () => {
      const followerChain = createMockQueryChain({
        data: { id: 'u1', username: 'Follower' },
        error: null,
      });
      const followingChain = createMockQueryChain({
        data: { id: 'u2', username: 'Following' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: { is_deleted: false, is_deactivated: true },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(targetChain);

      await expect(service.followUser('u1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if already following (upsert returns null)', async () => {
      const followerChain = createMockQueryChain({
        data: { id: 'u1', username: 'Follower' },
        error: null,
      });
      const followingChain = createMockQueryChain({
        data: { id: 'u2', username: 'Following' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: { is_deleted: false, is_deactivated: false },
        error: null,
      });
      const upsertChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(upsertChain);

      await expect(service.followUser('u1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('unfollowUser', () => {
    it('should unfollow user successfully', async () => {
      const followerChain = createMockQueryChain({
        data: { username: 'Follower' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.unfollowUser('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.FOLLOW.UNFOLLOWED);
    });

    it('should throw on delete error', async () => {
      const followerChain = createMockQueryChain({
        data: { username: 'Follower' },
        error: null,
      });
      const deleteChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });

      mockClient.from
        .mockReturnValueOnce(followerChain)
        .mockReturnValueOnce(deleteChain);

      await expect(service.unfollowUser('u1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('checkFollowStatus', () => {
    it('should return follow status', async () => {
      const isFollowingChain = createMockQueryChain({
        data: { id: 'f1', created_at: '2026-01-01' },
        error: null,
      });
      const isFollowedByChain = createMockQueryChain({
        data: null,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(isFollowingChain)
        .mockReturnValueOnce(isFollowedByChain);

      const result = await service.checkFollowStatus('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.data.isFollowing).toBe(true);
      expect(result.data.isFollowedBy).toBe(false);
    });

    it('should return both false when no follows', async () => {
      const chain1 = createMockQueryChain({ data: null, error: null });
      const chain2 = createMockQueryChain({ data: null, error: null });

      mockClient.from.mockReturnValueOnce(chain1).mockReturnValueOnce(chain2);

      const result = await service.checkFollowStatus('u1', 'u2');
      expect(result.data.isFollowing).toBe(false);
      expect(result.data.isFollowedBy).toBe(false);
    });
  });
});
