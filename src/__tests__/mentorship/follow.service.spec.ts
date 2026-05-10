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
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
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

  describe('getFollowing', () => {
    it('should return list of users that userId is following', async () => {
      const follows = [
        {
          id: 'f1',
          created_at: '2026-01-01',
          following: { id: 'u2', username: 'Mentor', avatar: '📚', job_title: 'CTO', company_type: null, mentoring_as: 'mentor', is_willing_to_mentor: true, mentor_bio: null, location: 'NYC', years_experience: 5, career_level_encrypted: null, affinity_tags_encrypted: null, first_name_encrypted: null, last_name_encrypted: null, has_completed_onboarding: true, is_deleted: false, is_deactivated: false },
        },
      ];
      const chain = createMockQueryChain({ data: follows, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getFollowing('u1');
      expect(result.success).toBe(true);
      expect(result.data.following).toHaveLength(1);
    });

    it('should return empty list when not following anyone', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getFollowing('u1');
      expect(result.success).toBe(true);
      expect(result.data.following).toHaveLength(0);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getFollowing('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFollowers', () => {
    it('should return list of users following userId', async () => {
      const followers = [
        {
          id: 'f1',
          created_at: '2026-01-01',
          follower: { id: 'u2', username: 'User2', avatar: '🔥', job_title: 'Dev', company_type: null, mentoring_as: 'mentee', is_willing_to_mentor: false, mentor_bio: null, location: 'NYC', years_experience: 2, career_level_encrypted: null, affinity_tags_encrypted: null, first_name_encrypted: null, last_name_encrypted: null, has_completed_onboarding: true, is_deleted: false, is_deactivated: false },
        },
      ];
      const chain = createMockQueryChain({ data: followers, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getFollowers('u1');
      expect(result.success).toBe(true);
      expect(result.data.followers).toHaveLength(1);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getFollowers('u1')).rejects.toThrow(BadRequestException);
    });
  });
});
