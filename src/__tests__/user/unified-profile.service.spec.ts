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
import { UnifiedProfileService } from '../../modules/user/services/unified-profile.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

const mockCompanies = {
  resolve: jest.fn(async (name: string) => ({
    name,
    columns: {
      company_encrypted: 'enc_' + name,
      company_type: 'static',
      company_key: null,
    },
  })),
};

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
      mockCompanies as any,
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
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });

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
        data: {
          id: 'u1',
          username: 'User1',
          first_name_encrypted: 'enc_Jane',
          last_name_encrypted: 'enc_Doe',
        },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.updateProfile('u1', {
        basic: {
          first_name: 'Jane',
          last_name: 'Doe',
          location: 'NYC',
          years_experience: 5,
          skills: ['Python'],
        },
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
      const deleteTokensChain = createMockQueryChain({
        data: null,
        error: null,
      });
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
        data: {
          id: 'u1',
          username: 'User1',
          is_active_mentee: true,
          mentee_bio: 'learning',
        },
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
      const existingUserChain = createMockQueryChain({
        data: { id: 'other-u' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(existingUserChain);

      await expect(
        service.updateProfile('u1', {
          basic: { username: 'takenName' },
        } as any),
      ).rejects.toThrow();
    });

    it('should throw on update error', async () => {
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      await expect(
        service.updateProfile('u1', { basic: { bio: 'x' } } as any),
      ).rejects.toThrow();
    });

    it('should encrypt identity fields', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'User1',
          career_level_encrypted: 'enc_senior',
        },
        error: null,
      });
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValue(countChain);

      const result = await service.updateProfile('u1', {
        identity: {
          career_level: 'senior',
          race: 'x',
          gender: 'y',
          affinity_tags: ['a'],
        },
      } as any);
      expect(result.success).toBe(true);
    });

    it('should update mentor fields', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1', mentor_bio: 'expert mentor' },
        error: null,
      });
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 0,
      });

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

  describe('answerStudentCheck', () => {
    it('ends student status on "no", keeping the school as a past school', async () => {
      const update = createMockQueryChain({ data: [{ id: 'u1' }], error: null });
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: { is_student: true, school_encrypted: 'enc_UNILAG' }, error: null }))
        .mockReturnValueOnce(update);
      const result = await service.answerStudentCheck('u1', { stillStudent: false });
      expect(result.data.is_student).toBe(false);
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_student: false, school_alumni_encrypted: 'enc_UNILAG' }),
      );
    });

    it('records "yes" and an updated finish year', async () => {
      const update = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: { is_student: true }, error: null }))
        .mockReturnValueOnce(update);
      await service.answerStudentCheck('u1', { stillStudent: true, expectedGradYear: 2029 });
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ expected_grad_year: 2029, student_status_checked_at: expect.any(String) }),
      );
    });

    it('refuses "yes" from a member who is not a student', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: { is_student: false }, error: null }));
      await expect(service.answerStudentCheck('u1', { stillStudent: true })).rejects.toThrow(BadRequestException);
    });
  });

  describe('country, school and company rules', () => {
    // Returns the object passed to the main profile update.
    const savedUpdate = () => {
      for (const r of mockClient.from.mock.results) {
        const calls = r.value.update?.mock?.calls ?? [];
        if (calls.length) return calls[0][0];
      }
      return undefined;
    };
    const chain = (data: any) => createMockQueryChain({ data, error: null });

    it('saves the country code', async () => {
      mockClient.from.mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        basic: { country_code: 'GB' },
      } as any);
      expect(savedUpdate().country_code).toBe('GB');
    });

    it('keeps the school as a past school when student is turned off', async () => {
      mockClient.from
        .mockReturnValueOnce(
          chain({ is_student: true, school_encrypted: 'enc_Unilag' }),
        )
        .mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        school: { is_student: false },
      } as any);
      const saved = savedUpdate();
      expect(saved.is_student).toBe(false);
      expect(saved.school_alumni_encrypted).toBe('enc_Unilag');
      expect(saved.school_encrypted).toBeNull();
      expect(saved.expected_grad_year).toBeNull();
    });

    it('needs a school name to turn student on', async () => {
      mockClient.from.mockReturnValue(
        chain({ is_student: false, school_encrypted: null }),
      );
      await expect(
        service.updateProfile('u1', { school: { is_student: true } } as any),
      ).rejects.toThrow('Add your school or university');
    });

    it('removes the company when the name is empty', async () => {
      mockClient.from
        .mockReturnValueOnce(
          chain({
            company_encrypted: 'enc_OldCo',
            company_alumni_encrypted: [],
          }),
        )
        .mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        company: { company_name: '' },
      } as any);
      const saved = savedUpdate();
      expect(saved.company_encrypted).toBeNull();
      expect(saved.company_type).toBeNull();
      expect(saved.company_alumni_encrypted).toEqual([
        expect.stringContaining('OldCo'),
      ]);
    });

    it('sets the company type from the company list', async () => {
      mockCompanies.resolve.mockResolvedValueOnce({
        name: 'Dangote',
        columns: {
          company_encrypted: 'enc_Dangote',
          company_type: 'other',
          company_key: 'k1',
        },
      });
      mockClient.from
        .mockReturnValueOnce(
          chain({ company_encrypted: null, company_alumni_encrypted: [] }),
        )
        .mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        company: { company_name: 'dangote' },
      } as any);
      expect(savedUpdate()).toEqual(
        expect.objectContaining({ company_type: 'other', company_key: 'k1' }),
      );
    });

    it('does not save a school for someone who is not a student', async () => {
      mockClient.from
        .mockReturnValueOnce(
          chain({ is_student: false, school_encrypted: null }),
        )
        .mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        school: { school_name: 'Unilag' },
      } as any);
      expect(savedUpdate()?.school_encrypted).toBeUndefined();
    });

    it('treats a null company as removing it', async () => {
      mockClient.from
        .mockReturnValueOnce(
          chain({
            company_encrypted: 'enc_OldCo',
            company_alumni_encrypted: [],
          }),
        )
        .mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        company: { company_name: null },
      } as any);
      expect(savedUpdate().company_encrypted).toBeNull();
    });

    it('joins several ethnicities into one value', async () => {
      mockClient.from.mockReturnValue(chain({ id: 'u1' }));
      await service.updateProfile('u1', {
        identity: { ethnicities: ['South Asian', 'White'] },
      } as any);
      expect(savedUpdate().race_encrypted).toBe('enc_South Asian, White');
    });
  });
});
