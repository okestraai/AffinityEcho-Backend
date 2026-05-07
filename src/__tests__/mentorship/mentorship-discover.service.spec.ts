jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { BadRequestException } from '@nestjs/common';
import { MentorshipDiscoverService } from '../../modules/mentorship/services/mentorship-discover.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('MentorshipDiscoverService', () => {
  let service: MentorshipDiscoverService;
  let mockClient: any;
  let mockRedis: any;

  const mockProfile = {
    id: 'u2', username: 'Mentor1', avatar: '📚', bio: 'Expert',
    job_title: 'CTO', location: 'NYC', years_experience: 10,
    mentoring_as: 'mentor', is_active_mentor: true, is_company_verified: true,
    career_level_encrypted: 'enc_senior', company_encrypted: 'enc_Google',
    affinity_tags_encrypted: null, mentor_expertise: ['leadership'],
    mentor_industries: ['tech'], mentor_availability: 'Weekly',
    mentor_style: 'Structured', mentor_languages: ['English'],
    mentor_bio: 'I help people grow',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockRedis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };

    const mockEncryption = { encrypt: jest.fn(v => 'enc_' + v), decrypt: jest.fn(v => 'dec_' + v) };
    const mockIdentityReveal = { getRevealedUserIds: jest.fn().mockResolvedValue(new Set()), decryptRealName: jest.fn().mockReturnValue(null) };

    service = new MentorshipDiscoverService(
      createMockConfigService() as any,
      mockRedis, mockEncryption, mockIdentityReveal,
    );
  });

  describe('discoverProfiles', () => {
    it.skip('should return mentor profiles excluding self', async () => {
      // Parallel queries: existing requests, existing relationships, current user profile
      const existingRequestsChain = createMockQueryChain({ data: [], error: null });
      const existingRelChain = createMockQueryChain({ data: [], error: null });
      const currentProfileChain = createMockQueryChain({ data: { mentor_expertise: [], mentor_industries: [], location: 'NYC' }, error: null });
      // Main profiles query
      const profilesChain = createMockQueryChain({ data: [mockProfile], error: null, count: 1 });

      mockClient.from
        .mockReturnValueOnce(existingRequestsChain)
        .mockReturnValueOnce(existingRelChain)
        .mockReturnValueOnce(currentProfileChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.discoverProfiles('u1', { role: 'mentor' } as any);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it.skip('should filter by role', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { role: 'mentee' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', {} as any);
      expect(result.success).toBe(true);
    });

    it.skip('should filter by expertise', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.discoverProfiles('u1', { expertise: 'leadership' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should handle DB error gracefully', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.discoverProfiles('u1', {} as any)).rejects.toThrow();
    });
  });

  describe('getAffinityGroups', () => {
    it.skip('should return affinity groups', async () => {
      const result = await service.getAffinityGroups();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
