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
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MentorshipChatService } from '../../modules/messaging/services/mentorship-chat.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('MentorshipChatService', () => {
  let service: MentorshipChatService;
  let mockClient: any;

  const mockProfile = {
    id: 'u2',
    username: 'Mentor1',
    avatar: '📚',
    mentor_bio: 'Expert',
    mentor_expertise: ['leadership'],
    mentor_industries: ['tech'],
    mentor_availability: 'Weekly',
    mentor_style: 'Structured',
    mentoring_as: 'mentor',
    years_experience: 10,
    job_title: 'CTO',
    company_encrypted: 'enc_Google',
    career_level_encrypted: 'enc_senior',
    reputation_score: 50,
    mentorship_sessions_completed: 5,
    last_active_at: '2026-05-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    const mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };
    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
    };

    service = new MentorshipChatService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('getMentorshipProfile', () => {
    it.skip('should return mentorship profile', async () => {
      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      mockClient.from.mockReturnValue(profileChain);

      const result = await service.getMentorshipProfile('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.data.username).toBe('Mentor1');
    });

    it.skip('should throw if profile not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getMentorshipProfile('u1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.skip('should decrypt company and career level', async () => {
      const chain = createMockQueryChain({ data: mockProfile, error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getMentorshipProfile('u1', 'u2');
      expect(result.data.company).toBe('dec_enc_Google');
      expect(result.data.careerLevel).toBe('dec_enc_senior');
    });
  });

  describe('getMentorshipConversations', () => {
    it.skip('should return mentorship conversations', async () => {
      const convsChain = createMockQueryChain({
        data: [
          {
            id: 'conv-1',
            user1_id: 'u1',
            user2_id: 'u2',
            context_type: 'mentorship',
          },
        ],
        error: null,
      });
      const profilesChain = createMockQueryChain({
        data: [mockProfile],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convsChain)
        .mockReturnValueOnce(profilesChain);

      const result = await service.getMentorshipConversations('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it.skip('should handle empty conversations', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getMentorshipConversations('u1');
      expect(result.success).toBe(true);
    });

    it.skip('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getMentorshipConversations('u1')).rejects.toThrow();
    });
  });

  describe('startMentorshipChat', () => {
    it.skip('should create mentorship conversation', async () => {
      // Check existing conv
      const existChain = createMockQueryChain({ data: null, error: null });
      // Check relationship
      const relChain = createMockQueryChain({
        data: {
          id: 'rel-1',
          mentor_id: 'u2',
          mentee_id: 'u1',
          status: 'active',
        },
        error: null,
      });
      // Create conversation
      const insertChain = createMockQueryChain({
        data: {
          id: 'conv-1',
          user1_id: 'u1',
          user2_id: 'u2',
          context_type: 'mentorship',
        },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.startMentorshipChat('u1', 'u2', 'rel-1');
      expect(result.success).toBe(true);
    });

    it.skip('should return existing conversation if already exists', async () => {
      const existChain = createMockQueryChain({
        data: { id: 'conv-existing', user1_id: 'u1', user2_id: 'u2' },
        error: null,
      });
      mockClient.from.mockReturnValue(existChain);

      const result = await service.startMentorshipChat('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('conv-existing');
    });
  });
});
