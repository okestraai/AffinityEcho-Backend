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
    it('should return mentorship profile', async () => {
      const profileChain = createMockQueryChain({
        data: mockProfile,
        error: null,
      });
      const sessionsChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(sessionsChain);

      const result = await service.getMentorshipProfile('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.data.profile.username).toBe('Mentor1');
    });

    it('should throw if profile not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getMentorshipProfile('u1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should decrypt company and career level', async () => {
      const profileChain = createMockQueryChain({ data: mockProfile, error: null });
      const sessionsChain = createMockQueryChain({ data: [], error: null });
      mockClient.from
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(sessionsChain);

      const result = await service.getMentorshipProfile('u1', 'u2');
      expect(result.data.profile.company).toBe('dec_enc_Google');
      expect(result.data.profile.career_level).toBe('dec_enc_senior');
    });
  });

  describe('scheduleSession', () => {
    it('should schedule a session for active relationship', async () => {
      const relChain = createMockQueryChain({
        data: { mentor_id: 'u1', mentee_id: 'u2', status: 'active' },
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: { id: 's1', scheduled_at: '2026-06-01', duration_minutes: 60, status: 'scheduled' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.scheduleSession('u1', 'rel-1', {
        scheduled_at: '2026-06-01',
        duration_minutes: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should throw if relationship not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.scheduleSession('u1', 'nope', { scheduled_at: '2026-06-01' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not authorized for relationship', async () => {
      const chain = createMockQueryChain({
        data: { mentor_id: 'other', mentee_id: 'another', status: 'active' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.scheduleSession('u1', 'rel-1', { scheduled_at: '2026-06-01' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('startMentorshipChat', () => {
    const mockAcceptedRequest = {
      requester_id: 'u1',
      target_user_id: 'u2',
      request_type: 'mentor_request',
      status: 'accepted',
    };

    it('should create mentorship conversation when none exists', async () => {
      const requestChain = createMockQueryChain({ data: mockAcceptedRequest, error: null });
      const existingRelChain = createMockQueryChain({ data: null, error: null });
      const newRelChain = createMockQueryChain({ data: { id: 'rel-1' }, error: null });
      const existingConvChain = createMockQueryChain({ data: null, error: null });
      const convInsertChain = createMockQueryChain({ data: { id: 'conv-1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(existingRelChain)
        .mockReturnValueOnce(newRelChain)
        .mockReturnValueOnce(existingConvChain)
        .mockReturnValueOnce(convInsertChain);

      const result = await service.startMentorshipChat('u1', 'req-1');
      expect(result.success).toBe(true);
      expect(result.data.conversation_id).toBe('conv-1');
    });

    it('should return existing conversation if already exists', async () => {
      const requestChain = createMockQueryChain({ data: mockAcceptedRequest, error: null });
      const existingRelChain = createMockQueryChain({ data: { id: 'rel-existing' }, error: null });
      const existingConvChain = createMockQueryChain({ data: { id: 'conv-existing' }, error: null });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(existingRelChain)
        .mockReturnValueOnce(existingConvChain);

      const result = await service.startMentorshipChat('u1', 'req-1');
      expect(result.success).toBe(true);
      expect(result.data.conversation_id).toBe('conv-existing');
    });
  });
});
