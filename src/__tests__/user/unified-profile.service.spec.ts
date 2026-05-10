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

import { NotFoundException } from '@nestjs/common';
import { UnifiedProfileService } from '../../modules/user/services/unified-profile.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('UnifiedProfileService', () => {
  let service: UnifiedProfileService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };
    service = new UnifiedProfileService(
      createMockConfigService() as any,
      mockEncryption,
    );
  });

  describe('getFullProfile', () => {
    it('should return full unified profile', async () => {
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'User1',
          avatar: '🔥',
          bio: 'hi',
          job_title: 'Dev',
          company_encrypted: 'enc_Google',
          career_level_encrypted: 'enc_senior',
          affinity_tags_encrypted: null,
          mentoring_as: 'mentor',
          is_company_verified: true,
        },
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
      const postsChain = createMockQueryChain({
        data: null,
        error: null,
        count: 15,
      });

      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain)
        .mockReturnValueOnce(postsChain);

      const result = await service.getEditableProfile('u1');
      expect(result.success).toBe(true);
      expect(result.data.basic.username).toBe('User1');
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getEditableProfile('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return mentor section when is_active_mentor is true', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'MentorUser',
          is_active_mentor: true,
          mentor_bio: 'I mentor people',
          mentor_expertise: ['leadership'],
          mentor_industries: ['tech'],
          mentor_availability: 'Weekly',
          mentor_response_time: '24h',
          mentor_style: 'Structured',
          mentor_languages: ['English'],
          mentor_hourly_rate: 0,
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getEditableProfile('u1');
      expect(result.success).toBe(true);
      expect(result.data.mentor).not.toBeNull();
      expect(result.data.mentor.mentor_bio).toBe('I mentor people');
    });

    it('should return mentee section when is_active_mentee is true', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'MenteeUser',
          is_active_mentee: true,
          mentee_bio: 'I want to learn',
          mentee_goals: 'Become a senior dev',
          mentee_interests: ['web'],
          mentee_industries: ['tech'],
          mentee_availability: 'Weekly',
          mentee_urgency: 'medium',
          mentee_topic: 'career',
          mentored_style: 'flexible',
          mentee_languages: ['English'],
          communication_method: 'video',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getEditableProfile('u1');
      expect(result.success).toBe(true);
      expect(result.data.mentee).not.toBeNull();
      expect(result.data.mentee.mentee_bio).toBe('I want to learn');
    });

    it('should decrypt encrypted fields', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'User1',
          avatar: '🔥',
          company_encrypted: 'enc_Google',
          career_level_encrypted: 'enc_senior',
          affinity_tags_encrypted: 'enc_tags',
        },
        error: null,
      });
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });
      mockClient.from.mockReturnValueOnce(chain).mockReturnValue(countChain);

      const result = await service.getEditableProfile('u1');
      expect(result.data.company.company_name).toBe('dec_enc_Google');
    });
  });

  describe('updateProfile', () => {
    it('should update basic profile fields', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'NewUser', avatar: '🔥', bio: 'new bio' },
        error: null,
      });
      const countChain = createMockQueryChain({ data: null, error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(countChain);

      const result = await service.updateProfile('u1', {
        basic: { bio: 'new bio', avatar: '🔥' },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should encrypt first_name and last_name in basic section', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', first_name_encrypted: 'enc_Jane', last_name_encrypted: 'enc_Doe' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.updateProfile('u1', {
        basic: { first_name: 'Jane', last_name: 'Doe', location: 'NYC', years_experience: 5, skills: ['Python'] },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should update company without alumni logic when no current company', async () => {
      // 1) from('user_profiles') - select current profile (company_encrypted: null)
      // 2) from('user_profiles') - main UPDATE
      // 3) from('user_profiles') - getEditableProfile
      const currentProfileChain = createMockQueryChain({
        data: { company_encrypted: null, company_alumni_encrypted: [] },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', company_encrypted: 'enc_NewCo' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(currentProfileChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.updateProfile('u1', {
        company: { company_name: 'NewCo' },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should move old company to alumni when company changes', async () => {
      // 1) from('user_profiles') - select current profile
      // 2) from('company_verification_tokens') - delete tokens
      // 3) from('user_profiles') - main UPDATE
      // 4) from('user_profiles') - getEditableProfile
      const currentProfileChain = createMockQueryChain({
        data: { company_encrypted: 'enc_OldCo', company_alumni_encrypted: [] },
        error: null,
      });
      const deleteTokensChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', company_encrypted: 'enc_NewCo' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(currentProfileChain)
        .mockReturnValueOnce(deleteTokensChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.updateProfile('u1', {
        company: { company_name: 'NewCo' },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should update mentee section fields', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', is_active_mentee: true, mentee_bio: 'learning' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.updateProfile('u1', {
        mentee: {
          mentee_bio: 'learning',
          goals: 'Grow as a developer',
          interests: ['web'],
          industries: ['tech'],
          availability: 'Weekly',
          urgency: 'low',
          topic: 'career',
          mentored_style: 'structured',
          languages: ['English'],
          communication_method: 'video',
        },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException if username taken', async () => {
      const existingUserChain = createMockQueryChain({ data: { id: 'other-u' }, error: null });
      mockClient.from.mockReturnValueOnce(existingUserChain);

      await expect(
        service.updateProfile('u1', { basic: { username: 'takenName' } } as any),
      ).rejects.toThrow();
    });

    it('should throw on update error', async () => {
      const updateChain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(updateChain);

      await expect(
        service.updateProfile('u1', { basic: { bio: 'x' } } as any),
      ).rejects.toThrow();
    });

    it('should encrypt identity fields', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', career_level_encrypted: 'enc_senior' },
        error: null,
      });
      const countChain = createMockQueryChain({ data: null, error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(countChain);

      const result = await service.updateProfile('u1', {
        identity: { career_level: 'senior', race: 'x', gender: 'y', affinity_tags: ['a'] },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should update mentor fields', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', mentor_bio: 'expert mentor' },
        error: null,
      });
      const countChain = createMockQueryChain({ data: null, error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(countChain);

      const result = await service.updateProfile('u1', {
        mentor: { mentor_bio: 'expert mentor', expertise: ['leadership'] },
      } as any);
      expect(result.success).toBe(true);
    });
  });
});
