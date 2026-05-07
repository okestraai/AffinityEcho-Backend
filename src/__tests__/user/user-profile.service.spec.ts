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
import { UserProfileService } from '../../modules/user/services/user-profile.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let mockClient: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;

  const mockProfile = {
    id: 'u1',
    username: 'TestUser',
    avatar: '🔥',
    bio: 'hello',
    job_title: 'Dev',
    location: 'NYC',
    skills: ['ts'],
    linkedin_url: null,
    badges: [],
    created_at: '2026-01-01',
    career_level_encrypted: 'enc_senior',
    company_encrypted: 'enc_Google',
    affinity_tags_encrypted: null,
    first_name_encrypted: 'enc_John',
    last_name_encrypted: 'enc_Doe',
    total_posts: 5,
    total_comments: 10,
    helpful_votes_received: 3,
    reputation_score: 18,
    is_willing_to_mentor: false,
    mentor_bio: null,
    mentor_expertise: [],
    mentor_style: null,
    mentor_availability: null,
    is_deleted: false,
    is_deactivated: false,
    profile_visibility: 'public',
    show_company: true,
    show_location: true,
    show_activity: true,
    show_connections: true,
    years_experience: 5,
    is_company_verified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };
    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
    };

    service = new UserProfileService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('getUserProfileById', () => {
    it.skip('should return own profile with full data', async () => {
      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      const followersChain = createMockQueryChain({
        data: null,
        error: null,
        count: 10,
      });
      const followingChain = createMockQueryChain({
        data: null,
        error: null,
        count: 5,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain);

      const result = await service.getUserProfileById('u1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.username).toBe('TestUser');
      expect(result.data.company).toBe('dec_enc_Google');
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getUserProfileById('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if user is deleted', async () => {
      const chain = createMockQueryChain({
        data: { ...mockProfile, is_deleted: true },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getUserProfileById('u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if user is deactivated', async () => {
      const chain = createMockQueryChain({
        data: { ...mockProfile, is_deactivated: true },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getUserProfileById('u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should hide profile if blocked', async () => {
      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      const blockChain = createMockQueryChain({
        data: { id: 'block-1' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(blockChain);

      await expect(service.getUserProfileById('u1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private profiles', async () => {
      const profileChain = createMockQueryChain({
        data: { ...mockProfile, profile_visibility: 'private' },
        error: null,
      });
      const noBlockChain = createMockQueryChain({ data: null, error: null });
      const followersChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });
      const followingChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });
      const iFollowChain = createMockQueryChain({ data: null, error: null });
      const theyFollowChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(noBlockChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(iFollowChain)
        .mockReturnValueOnce(theyFollowChain);

      await expect(service.getUserProfileById('u1', 'u2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return limited profile for connections-only visibility when not following', async () => {
      const profileChain = createMockQueryChain({
        data: { ...mockProfile, profile_visibility: 'connections' },
        error: null,
      });
      const noBlockChain = createMockQueryChain({ data: null, error: null });
      const followersChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });
      const followingChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });
      const iFollowChain = createMockQueryChain({ data: null, error: null }); // not following
      const theyFollowChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(noBlockChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(iFollowChain)
        .mockReturnValueOnce(theyFollowChain);

      const result = await service.getUserProfileById('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.data.message).toBe(MSG.USER.FOLLOW_TO_VIEW);
    });

    it.skip('should hide followers/following counts when show_connections is false', async () => {
      const profileChain = createMockQueryChain({
        data: { ...mockProfile, show_connections: false },
        error: null,
      });
      const noBlockChain = createMockQueryChain({ data: null, error: null });
      const followersChain = createMockQueryChain({
        data: null,
        error: null,
        count: 50,
      });
      const followingChain = createMockQueryChain({
        data: null,
        error: null,
        count: 30,
      });
      const iFollowChain = createMockQueryChain({ data: null, error: null });
      const theyFollowChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(noBlockChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(iFollowChain)
        .mockReturnValueOnce(theyFollowChain);

      const result = await service.getUserProfileById('u1', 'u2');
      expect(result.data.followersCount).toBeUndefined();
      expect(result.data.followingCount).toBeUndefined();
    });
  });

  describe('updateAvatar', () => {
    it('should update avatar', async () => {
      const chain = createMockQueryChain({
        data: { avatar: '🎯' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.updateAvatar('u1', '🎯');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.USER.AVATAR_UPDATED);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.updateAvatar('u1', '🎯')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateUsername', () => {
    it('should update username', async () => {
      const checkChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({
        data: { username: 'NewName' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateUsername('u1', 'NewName');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.USER.USERNAME_UPDATED);
    });

    it('should throw if username taken', async () => {
      const chain = createMockQueryChain({
        data: { id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.updateUsername('u1', 'TakenName')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
