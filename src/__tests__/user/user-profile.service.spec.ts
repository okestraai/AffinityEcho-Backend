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
      isRevealed: jest.fn().mockResolvedValue(false),
    };

    service = new UserProfileService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('getUserProfileById', () => {
    it('should return own profile with full data', async () => {
      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      const defaultChain = createMockQueryChain({
        data: null,
        error: null,
        count: 10,
      });
      const statsProfileChain = createMockQueryChain({
        data: { id: 'u1', mentorship_sessions_completed: 0 },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)   // main profile fetch
        .mockReturnValueOnce(defaultChain)   // followers count
        .mockReturnValueOnce(defaultChain)   // following count
        .mockReturnValueOnce(statsProfileChain) // getUserStats profile check
        .mockReturnValue(defaultChain);      // remaining getUserStats queries

      const result = await service.getUserProfileById('u1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.username).toBe('TestUser');
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

    it('should hide followers/following counts when show_connections is false', async () => {
      const profileChain = createMockQueryChain({
        data: { ...mockProfile, show_connections: false },
        error: null,
      });
      const defaultChain = createMockQueryChain({ data: null, error: null, count: 50 });
      const statsProfileChain = createMockQueryChain({
        data: { id: 'u1', mentorship_sessions_completed: 0 },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)      // main profile fetch
        .mockReturnValueOnce(defaultChain)      // block check
        .mockReturnValueOnce(defaultChain)      // followers count
        .mockReturnValueOnce(defaultChain)      // following count
        .mockReturnValueOnce(defaultChain)      // iFollow check
        .mockReturnValueOnce(defaultChain)      // theyFollow check
        .mockReturnValueOnce(statsProfileChain) // getUserStats profile check
        .mockReturnValue(defaultChain);         // remaining getUserStats queries

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

  describe('getUserStats', () => {
    it('should return user stats', async () => {
      const profileChain = createMockQueryChain({
        data: { id: 'u1', mentorship_sessions_completed: 2 },
        error: null,
      });
      const countChain = createMockQueryChain({ data: [], error: null, count: 5 });
      const likesChain = createMockQueryChain({ data: [{ likes_count: 3 }], error: null });
      const reactionsChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(profileChain) // profile check
        .mockReturnValueOnce(countChain)   // feed_posts
        .mockReturnValueOnce(countChain)   // referral_posts
        .mockReturnValueOnce(countChain)   // forum_comments
        .mockReturnValueOnce(countChain)   // feed_comments
        .mockReturnValueOnce(countChain)   // referral_comments
        .mockReturnValueOnce(countChain)   // forum_topics
        .mockReturnValueOnce(countChain)   // nook_members
        .mockReturnValueOnce(likesChain)   // feed_posts likes_count
        .mockReturnValueOnce(reactionsChain) // forum_topics reactions
        .mockReturnValueOnce(likesChain)   // referral_posts likes
        .mockReturnValueOnce(countChain)   // referral connections
        .mockReturnValueOnce(countChain);  // followers

      const result = await service.getUserStats('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should throw NotFoundException when user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getUserStats('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserBadges', () => {
    it('should return user badges', async () => {
      const mockStats = {
        success: true,
        data: {
          postsCreated: 5,
          commentsPosted: 3,
          topicsCreated: 1,
          helpfulReactions: 2,
          mentorshipSessions: 0,
          referralsMade: 0,
          followersCount: 10,
        },
      };
      jest.spyOn(service, 'getUserStats').mockResolvedValue(mockStats as any);

      const badgesChain = createMockQueryChain({ data: { badges: [] }, error: null });
      mockClient.from.mockReturnValueOnce(badgesChain);

      const result = await service.getUserBadges('u1');
      expect(result.success).toBe(true);
      expect(result.data.badges).toBeDefined();
    });
  });

  describe('getFullUserProfile', () => {
    it('should return full profile for a user', async () => {
      const mockBaseResult = {
        success: true,
        data: { ...mockProfile, followersCount: 5, followingCount: 3 },
      };
      jest.spyOn(service, 'getUserProfileById').mockResolvedValue(mockBaseResult as any);

      const defaultChain = createMockQueryChain({ data: [], error: null });
      const encChain = createMockQueryChain({ data: { first_name_encrypted: null, last_name_encrypted: null }, error: null });
      mockClient.from
        .mockReturnValueOnce(defaultChain)  // feed_posts
        .mockReturnValueOnce(defaultChain)  // forum_topics
        .mockReturnValueOnce(defaultChain)  // nooks
        .mockReturnValueOnce(defaultChain)  // feed_comments
        .mockReturnValueOnce(encChain);     // user_profiles encrypted fields

      const result = await service.getFullUserProfile('u1', 'u1');
      expect(result.success).toBe(true);
    });
  });

  describe('getUserActivity', () => {
    it('should return empty activities for type all with no data', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from
        .mockReturnValueOnce(emptyChain) // feed_posts
        .mockReturnValueOnce(emptyChain) // forum_topics
        .mockReturnValueOnce(emptyChain); // nooks

      const result = await service.getUserActivity('u1', 'all');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should return posts for type posts', async () => {
      const post = {
        id: 'p1', user_id: 'u1', content: 'Hello world', is_anonymous: false,
        tags: [], visibility: 'public', likes_count: 1, comments_count: 2,
        shares_count: 0, views_count: 10, created_at: '2026-01-01',
        user_profile: { id: 'u1', username: 'User1', avatar: '🔥', bio: null, first_name_encrypted: null, last_name_encrypted: null, is_company_verified: true },
      };
      const postsChain = createMockQueryChain({ data: [post], error: null, count: 1 });
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(postsChain)  // feed_posts (only)
        .mockReturnValueOnce(emptyChain)  // feed_likes (enrichment)
        .mockReturnValueOnce(emptyChain)  // feed_bookmarks (enrichment)
        .mockReturnValueOnce(emptyChain)  // feed_reactions user (enrichment)
        .mockReturnValueOnce(emptyChain); // feed_reactions all (enrichment)

      const result = await service.getUserActivity('u1', 'posts');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('post');
    });

    it('should return topics for type topics', async () => {
      const topic = {
        id: 't1', user_id: 'u1', title: 'Great topic', content: 'Content', is_anonymous: false,
        tags: [], scope: 'global', views_count: 5, comments_count: 3,
        reaction_seen_count: 1, reaction_validated_count: 0, reaction_inspired_count: 0, reaction_heard_count: 0,
        created_at: '2026-01-01',
        user_profile: { id: 'u1', username: 'User1', avatar: '🔥', bio: null, first_name_encrypted: null, last_name_encrypted: null, is_company_verified: true },
        forum: { id: 'f1', name: 'Forum 1' },
      };
      const topicsChain = createMockQueryChain({ data: [topic], error: null, count: 1 });
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(topicsChain)  // forum_topics (only)
        .mockReturnValueOnce(emptyChain)   // feed_likes (enrichment)
        .mockReturnValueOnce(emptyChain)   // feed_bookmarks (enrichment)
        .mockReturnValueOnce(emptyChain);  // topic_reactions (enrichment, no postIds so feed_reactions skipped)

      const result = await service.getUserActivity('u1', 'topics');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('topic');
    });

    it('should return nooks for type nooks', async () => {
      const nook = {
        id: 'n1', title: 'My Nook', description: 'A nook', creator_id: 'u1',
        urgency: 'high', scope: 'company', temperature: 'warm', hashtags: [],
        members_count: 5, messages_count: 10, expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: '2026-01-01',
        user_profile: { id: 'u1', username: 'User1', avatar: '🔥', bio: null, first_name_encrypted: null, last_name_encrypted: null },
      };
      const nooksChain = createMockQueryChain({ data: [nook], error: null, count: 1 });
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(nooksChain)   // nooks (only)
        .mockReturnValueOnce(emptyChain)   // feed_likes (enrichment)
        .mockReturnValueOnce(emptyChain);  // feed_bookmarks (enrichment)

      const result = await service.getUserActivity('u1', 'nooks');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('nook_message');
    });

    it('should handle null data gracefully', async () => {
      const nullChain = createMockQueryChain({ data: null, error: null, count: null });
      mockClient.from
        .mockReturnValueOnce(nullChain)
        .mockReturnValueOnce(nullChain)
        .mockReturnValueOnce(nullChain);

      const result = await service.getUserActivity('u1', 'all');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });
});
