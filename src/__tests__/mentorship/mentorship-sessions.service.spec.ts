jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { MentorshipSessionsService } from '../../modules/mentorship/services/mentorship-sessions.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('MentorshipSessionsService', () => {
  let service: MentorshipSessionsService;
  let mockClient: any;

  const mockRelationship = { mentor_id: 'u1', mentee_id: 'u2', status: 'active', total_sessions: 2 };
  const mockSession = { id: 's1', relationship_id: 'r1', scheduled_at: '2026-06-01T10:00:00Z', duration_minutes: 60, status: 'scheduled', meeting_url: 'https://meet.google.com/abc' };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new MentorshipSessionsService(createMockConfigService() as any);
  });

  describe('createSession', () => {
    it('should create session for active relationship', async () => {
      const relChain = createMockQueryChain({ data: mockRelationship, error: null });
      const insertChain = createMockQueryChain({ data: mockSession, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      // notification chains
      const notifChain1 = createMockQueryChain({ data: null, error: null });
      const notifChain2 = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(relChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(notifChain1)
        .mockReturnValueOnce(notifChain2);

      const result = await service.createSession('r1', { scheduledAt: '2026-06-01T10:00:00Z', durationMinutes: 60, meetingUrl: 'https://meet.google.com/abc' } as any);
      expect(result.message).toBe(MSG.MENTORSHIP.SESSION_CREATED);
      expect(result.session).toBeDefined();
    });

    it('should throw if relationship not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.createSession('nope', { scheduledAt: '2026-06-01' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw if relationship not active', async () => {
      const chain = createMockQueryChain({ data: { ...mockRelationship, status: 'ended' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.createSession('r1', { scheduledAt: '2026-06-01' } as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw on insert error', async () => {
      const relChain = createMockQueryChain({ data: mockRelationship, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from.mockReturnValueOnce(relChain).mockReturnValueOnce(insertChain);

      await expect(service.createSession('r1', { scheduledAt: '2026-06-01' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSessions', () => {
    it('should return sessions for relationship', async () => {
      const chain = createMockQueryChain({ data: [mockSession], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getSessions('r1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });

    it('should return empty array when no sessions', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getSessions('r1');
      expect(result).toEqual([]);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getSessions('r1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', async () => {
      const chain = createMockQueryChain({ data: mockSession, error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getSession('s1');
      expect(result).toBeDefined();
    });

    it('should throw if not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getSession('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSessionStatus', () => {
    it.skip('should update session status to completed', async () => {
      const sessionChain = createMockQueryChain({ data: { ...mockSession, relationship: mockRelationship }, error: null });
      const updateChain = createMockQueryChain({ data: { ...mockSession, status: 'completed' }, error: null });
      const relUpdateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(sessionChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(relUpdateChain);

      const result = await service.updateSessionStatus('s1', 'u1', { status: 'completed' } as any);
      expect(result).toBeDefined();
    });

    it.skip('should throw if session not found (updateSessionStatus)', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.updateSessionStatus('nope', 'u1', { status: 'completed' } as any)).rejects.toThrow(NotFoundException);
    });

    it.skip('should cancel session', async () => {
      const sessionChain = createMockQueryChain({ data: { ...mockSession, relationship: mockRelationship }, error: null });
      const updateChain = createMockQueryChain({ data: { ...mockSession, status: 'cancelled' }, error: null });

      mockClient.from
        .mockReturnValueOnce(sessionChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.updateSessionStatus('s1', 'u1', { status: 'cancelled' } as any);
      expect(result).toBeDefined();
    });
  });

  describe('rescheduleSession', () => {
    it.skip('should reschedule session', async () => {
      const sessionChain = createMockQueryChain({ data: mockSession, error: null });
      const updateChain = createMockQueryChain({ data: { ...mockSession, scheduled_at: '2026-06-15T10:00:00Z' }, error: null });
      const relUpdateChain = createMockQueryChain({ data: null, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(sessionChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(relUpdateChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.rescheduleSession('s1', 'u1', { scheduledAt: '2026-06-15T10:00:00Z' } as any);
      expect(result).toBeDefined();
    });

    it('should throw if session not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.rescheduleSession('nope', 'u1', { scheduledAt: '2026-06-15' } as any)).rejects.toThrow(NotFoundException);
    });
  });
});
