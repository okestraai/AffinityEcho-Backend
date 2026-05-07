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
import { MentorshipProfileService } from '../../modules/mentorship/services/mentorship-profile.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('MentorshipProfileService', () => {
  let service: MentorshipProfileService;
  let mockClient: any;
  let mockEncryption: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };

    service = new MentorshipProfileService(
      createMockConfigService() as any,
      mockEncryption,
    );
  });

  describe('setupMentorProfile', () => {
    it('should create mentor profile', async () => {
      const userChain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'User1',
          mentoring_as: null,
          is_active_mentee: false,
        },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'mentor', is_active_mentor: true },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.setupMentorProfile('u1', {
        bio: 'Expert in tech',
        jobTitle: 'CTO',
        location: 'NYC',
        yearsExperience: 10,
        isWillingToMentor: true,
        expertise: ['leadership'],
        availability: 'Weekly',
        mentoringStyle: 'Structured',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MENTORSHIP.MENTOR_CREATED);
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.setupMentorProfile('u1', { bio: 'hi' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw on update error', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: null, is_active_mentee: false },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.setupMentorProfile('u1', {
          bio: 'hi',
          isWillingToMentor: true,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set mentoring_as to both if already a mentee', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'mentee', is_active_mentee: true },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'both' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.setupMentorProfile('u1', {
        bio: 'hi',
        isWillingToMentor: true,
      } as any);
      expect(result.success).toBe(true);
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ mentoring_as: 'both' }),
      );
    });
  });

  describe('updateMentorProfile', () => {
    it('should update mentor profile', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'mentor', is_active_mentor: true },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'u1' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateMentorProfile('u1', {
        bio: 'Updated bio',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MENTORSHIP.MENTOR_UPDATED);
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.updateMentorProfile('u1', {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not a mentor', async () => {
      const chain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'mentee', is_active_mentor: false },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.updateMentorProfile('u1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setupMenteeProfile', () => {
    it('should create mentee profile', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: null, is_active_mentor: false },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'mentee' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.setupMenteeProfile('u1', {
        bio: 'Looking for mentorship',
        goals: 'Career growth',
        topic: 'Leadership',
        style: 'Structured',
        availability: 'Weekly',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MENTORSHIP.MENTEE_CREATED);
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.setupMenteeProfile('u1', { bio: 'hi' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMenteeProfile', () => {
    it('should update mentee profile', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', mentoring_as: 'mentee', is_active_mentee: true },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'u1' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateMenteeProfile('u1', {
        bio: 'Updated',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MENTORSHIP.MENTEE_UPDATED);
    });
  });

  describe('getProfile', () => {
    it('should return profile with decrypted fields', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'User1',
          avatar: '🔥',
          bio: 'hi',
          job_title: 'CTO',
          career_level_encrypted: 'enc_senior',
          company_encrypted: 'enc_Google',
          affinity_tags_encrypted: null,
          mentoring_as: 'mentor',
          is_active_mentor: true,
          is_company_verified: true,
          show_email: false,
          show_connections: true,
          first_name_encrypted: 'enc_John',
          last_name_encrypted: 'enc_Doe',
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

      mockClient.from
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(followersChain)
        .mockReturnValueOnce(followingChain);

      const result = await service.getProfile('u1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.username).toBe('User1');
    });

    it('should throw if profile not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getProfile('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('toggleMentorActive', () => {
    it('should activate mentor', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', is_active_mentor: false },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.toggleProfileSection('u1', 'mentor');
      expect(result.success).toBe(true);
    });

    it('should deactivate mentor', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1', is_active_mentor: true },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.toggleProfileSection('u1', 'mentor');
      expect(result.success).toBe(true);
    });
  });
});
