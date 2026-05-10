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

import { BadRequestException } from '@nestjs/common';
import { MentorshipDiscoverService } from '../../modules/mentorship/services/mentorship-discover.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('MentorshipDiscoverService', () => {
  let service: MentorshipDiscoverService;
  let mockClient: any;
  let mockRedis: any;

  const mockProfile = {
    id: 'u2',
    username: 'Mentor1',
    avatar: '📚',
    bio: 'Expert',
    job_title: 'CTO',
    location: 'NYC',
    years_experience: 10,
    mentoring_as: 'mentor',
    is_active_mentor: true,
    is_company_verified: true,
    career_level_encrypted: 'enc_senior',
    company_encrypted: 'enc_Google',
    affinity_tags_encrypted: null,
    mentor_expertise: ['leadership'],
    mentor_industries: ['tech'],
    mentor_availability: 'Weekly',
    mentor_style: 'Structured',
    mentor_languages: ['English'],
    mentor_bio: 'I help people grow',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      del: jest.fn(),
      getOrSet: jest.fn(async (_key: any, _ttl: any, factory: any) => factory()),
    };

    const mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };
    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
    };

    service = new MentorshipDiscoverService(
      createMockConfigService() as any,
      mockRedis,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('discoverProfiles', () => {
    it('should return mentor profiles excluding self', async () => {
      // Parallel queries: existing requests, existing relationships, current user profile
      const existingRequestsChain = createMockQueryChain({
        data: [],
        error: null,
      });
      const existingRelChain = createMockQueryChain({ data: [], error: null });
      const currentProfileChain = createMockQueryChain({
        data: { mentor_expertise: [], mentor_industries: [], location: 'NYC' },
        error: null,
      });
      // Main profiles query
      const profilesChain = createMockQueryChain({
        data: [mockProfile],
        error: null,
        count: 1,
      });

      mockClient.from
        .mockReturnValueOnce(existingRequestsChain)
        .mockReturnValueOnce(existingRelChain)
        .mockReturnValueOnce(currentProfileChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.discoverProfiles('u1', {
        role: 'mentor',
      } as any);
      expect(result.success).toBe(true);
      expect(result.profiles).toBeDefined();
    });

    it('should filter by role', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', {
        role: 'mentee',
      } as any);
      expect(result.success).toBe(true);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
    });

    it('should filter by expertise', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', {
        expertise: 'leadership',
      } as any);
      expect(result.success).toBe(true);
    });

    it('should handle DB error gracefully', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.discoverProfiles('u1', {} as any)).rejects.toThrow();
    });

    it('should apply viewMode=mentors filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { viewMode: 'mentors' } as any);
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('is_active_mentor', true);
    });

    it('should apply viewMode=mentees filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { viewMode: 'mentees' } as any);
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('is_active_mentee', true);
    });

    it('should apply search filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { search: 'john' } as any);
      expect(result.success).toBe(true);
      expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('john'));
    });

    it('should apply location filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { location: 'NYC' } as any);
      expect(result.success).toBe(true);
      expect(chain.ilike).toHaveBeenCalledWith('location', '%NYC%');
    });

    it('should apply availability filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { availability: 'immediate' } as any);
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('mentor_availability', 'Immediate');
    });

    it('should apply industries filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { industries: ['tech'] } as any);
      expect(result.success).toBe(true);
      expect(chain.overlaps).toHaveBeenCalledWith('mentor_industries', ['tech']);
    });

    it('should exclude existing mentorship pairs', async () => {
      const requestsChain = createMockQueryChain({
        data: [{ requester_id: 'u1', target_user_id: 'u3' }],
        error: null,
      });
      const relChain = createMockQueryChain({ data: [], error: null });
      const profileChain = createMockQueryChain({
        data: { mentor_expertise: [], mentor_industries: [], location: null, career_level_encrypted: null, affinity_tags_encrypted: null },
        error: null,
      });
      const mainChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(requestsChain)
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(mainChain);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
      // u3 should be excluded from results
      expect(mainChain.neq).toHaveBeenCalledWith('id', 'u3');
    });
  });

  describe('getAffinityGroups', () => {
    it('should return affinity groups', async () => {
      const result = await service.getFilterOptions();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('getSuggestions', () => {
    it('should return mentor suggestions', async () => {
      const currentUserChain = createMockQueryChain({
        data: { mentor_expertise: ['leadership'], mentor_industries: ['tech'], location: 'NYC', mentee_interests: [], career_level_encrypted: null, affinity_tags_encrypted: null, is_willing_to_mentor: false, mentoring_as: 'mentee' },
        error: null,
      });
      const profilesChain = createMockQueryChain({
        data: [{ ...mockProfile, affinity_tags_encrypted: null }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(currentUserChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.getSuggestions('u1', 'mentors', 10);
      expect(result).toBeDefined();
    });

    it('should return mentee suggestions', async () => {
      const currentUserChain = createMockQueryChain({
        data: { mentor_expertise: [], mentor_industries: [], location: 'NYC', mentee_interests: [], career_level_encrypted: null, affinity_tags_encrypted: null, is_willing_to_mentor: true, mentoring_as: 'mentor' },
        error: null,
      });
      const profilesChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(currentUserChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.getSuggestions('u1', 'mentees', 5);
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException when user not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getSuggestions('nope', 'mentors')).rejects.toThrow(BadRequestException);
    });

    it('should return cached result when available', async () => {
      const cached = { profiles: [], total: 0 };
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.getSuggestions('u1', 'mentors', 10);
      expect(result).toEqual(cached);
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('should handle DB error in getSuggestions', async () => {
      const currentUserChain = createMockQueryChain({
        data: { mentor_expertise: [], mentor_industries: [], location: null, mentee_interests: [], career_level_encrypted: null, affinity_tags_encrypted: null, is_willing_to_mentor: true, mentoring_as: 'mentor' },
        error: null,
      });
      const errorChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(currentUserChain)
        .mockReturnValueOnce(errorChain);

      await expect(service.getSuggestions('u1', 'mentors')).rejects.toThrow(BadRequestException);
    });

    it('should calculate suggestion scores with matching expertise and industries', async () => {
      const currentUserChain = createMockQueryChain({
        data: { mentor_expertise: ['leadership', 'management'], mentor_industries: ['tech', 'finance'], location: 'NYC', mentee_interests: [], career_level_encrypted: 'enc_mid', affinity_tags_encrypted: null, is_willing_to_mentor: false, mentoring_as: 'mentee' },
        error: null,
      });
      const profilesChain = createMockQueryChain({
        data: [
          { ...mockProfile, mentor_expertise: ['leadership'], mentor_industries: ['tech'], location: 'NYC', career_level_encrypted: 'enc_senior', affinity_tags_encrypted: null },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(currentUserChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.getSuggestions('u1', 'mentors', 10);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].matchScore).toBeGreaterThan(0);
    });
  });

  describe('discoverProfiles - advanced filters', () => {
    const makeFullMocks = (profileData: any[] = [], currentUser: any = {}) => {
      const reqChain = createMockQueryChain({ data: [], error: null });
      const relChain = createMockQueryChain({ data: [], error: null });
      const curChain = createMockQueryChain({ data: { mentor_expertise: [], mentor_industries: [], location: null, career_level_encrypted: null, affinity_tags_encrypted: null, ...currentUser }, error: null });
      const profilesChain = createMockQueryChain({ data: profileData, error: null, count: profileData.length });
      const bookmarksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(reqChain)
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(curChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(bookmarksChain);

      return { reqChain, relChain, curChain, profilesChain, bookmarksChain };
    };

    it('should apply expertise array filter', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { expertise: ['leadership', 'management'] } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.overlaps).toHaveBeenCalledWith('mentor_expertise', ['leadership', 'management']);
    });

    it('should apply languages filter', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { languages: ['English', 'Spanish'] } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.overlaps).toHaveBeenCalledWith('mentor_languages', ['English', 'Spanish']);
    });

    it('should sort by experience', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { sortBy: 'experience', sortOrder: 'asc' } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.order).toHaveBeenCalledWith('years_experience', expect.objectContaining({ ascending: true }));
    });

    it('should sort by reputation', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { sortBy: 'reputation' } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.order).toHaveBeenCalledWith('reputation_score', expect.objectContaining({ ascending: false }));
    });

    it('should sort by match_score in-memory', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', mentor_expertise: ['leadership'], career_level_encrypted: null, affinity_tags_encrypted: null },
        { ...mockProfile, id: 'p2', mentor_expertise: [], career_level_encrypted: null, affinity_tags_encrypted: null },
      ], { mentor_expertise: ['leadership'] });

      const result = await service.discoverProfiles('u1', { sortBy: 'match_score' } as any);
      expect(result.success).toBe(true);
      expect(result.profiles.length).toBe(2);
      // First profile should have higher score due to expertise match
      expect(result.profiles[0].matchScore).toBeGreaterThanOrEqual(result.profiles[1].matchScore);
    });

    it('should filter by minMatchScore', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', mentor_expertise: ['leadership'], career_level_encrypted: null, affinity_tags_encrypted: null },
        { ...mockProfile, id: 'p2', mentor_expertise: [], career_level_encrypted: null, affinity_tags_encrypted: null },
      ], { mentor_expertise: ['leadership'] });

      const result = await service.discoverProfiles('u1', { minMatchScore: 5 } as any);
      expect(result.success).toBe(true);
      // Only profiles with matchScore >= 5 should remain
      result.profiles.forEach((p: any) => {
        expect(p.matchScore).toBeGreaterThanOrEqual(5);
      });
    });

    it('should filter by maxMatchScore', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', mentor_expertise: ['leadership'], career_level_encrypted: null, affinity_tags_encrypted: null },
      ], { mentor_expertise: ['leadership'] });

      const result = await service.discoverProfiles('u1', { maxMatchScore: 50 } as any);
      expect(result.success).toBe(true);
      result.profiles.forEach((p: any) => {
        expect(p.matchScore).toBeLessThanOrEqual(50);
      });
    });

    it('should calculate match scores with career level compatibility', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', career_level_encrypted: 'Senior (8-12 years)', affinity_tags_encrypted: null, mentor_expertise: [], mentor_industries: [], reputation_score: 80, mentor_response_time: '24 hours' },
      ], { career_level_encrypted: 'Entry Level (0-2 years)', mentor_expertise: [], mentor_industries: [] });

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.profiles[0].matchScore).toBeGreaterThan(0);
    });

    it('should calculate match scores with location match', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', location: 'NYC', career_level_encrypted: null, affinity_tags_encrypted: null, mentor_expertise: [], mentor_industries: [] },
      ], { location: 'NYC' });

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.profiles[0].matchScore).toBeGreaterThanOrEqual(10);
    });

    it('should handle profiles with affinity_tags_encrypted', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', affinity_tags_encrypted: '["tag1","tag2"]', career_level_encrypted: null, mentor_expertise: [] },
      ]);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.profiles[0].affinity_tags).toBeDefined();
    });

    it('should filter by careerLevel in memory', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', career_level_encrypted: 'Senior (8-12 years)', affinity_tags_encrypted: null, mentor_expertise: [] },
        { ...mockProfile, id: 'p2', career_level_encrypted: null, affinity_tags_encrypted: null, mentor_expertise: [] },
      ]);

      const result = await service.discoverProfiles('u1', { careerLevel: ['Senior'] } as any);
      expect(result.success).toBe(true);
      // p2 has no career_level_encrypted so should be filtered out
      expect(result.profiles.length).toBeLessThanOrEqual(1);
    });

    it('should filter by affinityTags in memory', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', affinity_tags_encrypted: '["Black Professionals"]', career_level_encrypted: null, mentor_expertise: [] },
        { ...mockProfile, id: 'p2', affinity_tags_encrypted: null, career_level_encrypted: null, mentor_expertise: [] },
      ]);

      const result = await service.discoverProfiles('u1', { affinityTags: ['Black Professionals'] } as any);
      expect(result.success).toBe(true);
    });

    it('should return cached discover results', async () => {
      const cached = { success: true, profiles: [], total: 0, page: 1, limit: 20, totalPages: 0, metadata: {} };
      mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(cached);
      // The cache check happens after the first 3 from() calls
      // Actually redis.get is called once with the cacheKey
      mockRedis.get.mockReset();
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result).toEqual(cached);
    });

    it('should mark bookmarked profiles', async () => {
      const reqChain = createMockQueryChain({ data: [], error: null });
      const relChain = createMockQueryChain({ data: [], error: null });
      const curChain = createMockQueryChain({ data: { mentor_expertise: [], mentor_industries: [], location: null, career_level_encrypted: null, affinity_tags_encrypted: null }, error: null });
      const profilesChain = createMockQueryChain({ data: [{ ...mockProfile, id: 'p1', career_level_encrypted: null, affinity_tags_encrypted: null, mentor_expertise: [] }], error: null, count: 1 });
      const bookmarksChain = createMockQueryChain({ data: [{ bookmarked_user_id: 'p1' }], error: null });

      mockClient.from
        .mockReturnValueOnce(reqChain)
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(curChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(bookmarksChain);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.profiles[0].isBookmarked).toBe(true);
    });

    it('should exclude existing relationships', async () => {
      const reqChain = createMockQueryChain({ data: [], error: null });
      const relChain = createMockQueryChain({ data: [{ mentor_id: 'u1', mentee_id: 'u5' }], error: null });
      const curChain = createMockQueryChain({ data: { mentor_expertise: [], mentor_industries: [], location: null, career_level_encrypted: null, affinity_tags_encrypted: null }, error: null });
      const mainChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(reqChain)
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(curChain)
        .mockReturnValue(mainChain);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
      expect(mainChain.neq).toHaveBeenCalledWith('id', 'u5');
    });

    it('should handle activity score calculation with response time variants', async () => {
      makeFullMocks([
        { ...mockProfile, id: 'p1', reputation_score: 100, years_experience: 15, mentor_response_time: '48 hours', career_level_encrypted: null, affinity_tags_encrypted: null, mentor_expertise: [] },
        { ...mockProfile, id: 'p2', reputation_score: 0, years_experience: 1, mentor_response_time: '1 week', career_level_encrypted: null, affinity_tags_encrypted: null, mentor_expertise: [] },
      ]);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.profiles).toHaveLength(2);
    });

    it('should apply viewMode=all filter with or clause', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { viewMode: 'all' } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.or).toHaveBeenCalledWith('is_active_mentor.eq.true,is_active_mentee.eq.true');
    });

    it('should handle availability filter with within_week', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { availability: 'within_week' } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.eq).toHaveBeenCalledWith('mentor_availability', 'Within 1 week');
    });

    it('should handle availability filter with within_month', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { availability: 'within_month' } as any);
      expect(result.success).toBe(true);
      expect(profilesChain.eq).toHaveBeenCalledWith('mentor_availability', 'Within 1 month');
    });

    it('should skip availability filter when availability=all', async () => {
      const { profilesChain } = makeFullMocks();
      const result = await service.discoverProfiles('u1', { availability: 'all' } as any);
      expect(result.success).toBe(true);
      // 'all' should not add a mentor_availability filter
    });
  });
});
