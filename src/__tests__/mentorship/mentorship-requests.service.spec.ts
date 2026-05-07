jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));

import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { MentorshipRequestsService } from '../../modules/mentorship/services/mentorship-requests.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

// Suppress Logger output
jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();
jest.spyOn(console, 'warn').mockImplementation();

describe('MentorshipRequestsService', () => {
  let service: MentorshipRequestsService;
  let mockClient: any;
  let mockNotifications: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;

  const mockTargetUser = {
    id: 'u2', username: 'Mentor', avatar: '📚', is_willing_to_mentor: true,
    mentoring_as: 'mentor', is_deleted: false, is_deactivated: false, is_company_verified: true,
  };

  const mockRequest = {
    id: 'req-1', requester_id: 'u1', target_user_id: 'u2', request_type: 'mentor_request',
    status: 'pending', message: 'Hi', created_at: '2026-05-01',
    requester: { id: 'u1', username: 'Mentee', avatar: '🔥' },
    target_user: { id: 'u2', username: 'Mentor', avatar: '📚' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockNotifications = { createNotification: jest.fn().mockResolvedValue({}) };
    mockEncryption = { encrypt: jest.fn(v => 'enc_' + v), decrypt: jest.fn(v => 'dec_' + v) };
    mockIdentityReveal = { getRevealedUserIds: jest.fn().mockResolvedValue(new Set()), resolveNotificationName: jest.fn().mockResolvedValue('TestUser'), decryptRealName: jest.fn().mockReturnValue(null) };

    service = new MentorshipRequestsService(
      createMockConfigService() as any,
      mockNotifications, mockEncryption, mockIdentityReveal,
    );
  });

  describe('sendDirectRequest', () => {
    it.skip('should send a mentor request', async () => {
      // 1. target user + check existing (parallel)
      const targetChain = createMockQueryChain({ data: mockTargetUser, error: null });
      // checkExistingRequests uses two queries
      const existPendingChain = createMockQueryChain({ data: null, error: null });
      const existAcceptedChain = createMockQueryChain({ data: null, error: null });
      // 2. insert request
      const insertChain = createMockQueryChain({ data: mockRequest, error: null });
      // 3. notification
      const notifProfileChain = createMockQueryChain({ data: { username: 'Mentee' }, error: null });
      const notifInsertChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(targetChain)         // get target user
        .mockReturnValueOnce(existPendingChain)    // check pending
        .mockReturnValueOnce(existAcceptedChain)   // check accepted
        .mockReturnValueOnce(insertChain)          // insert request
        .mockReturnValueOnce(notifProfileChain)    // get requester profile for notification
        .mockReturnValueOnce(notifInsertChain);    // insert notification

      const result = await service.sendDirectRequest('u1', {
        targetUserId: 'u2', requestType: 'mentor_request', message: 'Hi',
      } as any);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should throw if target user not found', async () => {
      const targetChain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      const existChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(existChain);

      await expect(service.sendDirectRequest('u1', { targetUserId: 'nope', requestType: 'mentor_request' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw if target is deactivated', async () => {
      const targetChain = createMockQueryChain({ data: { ...mockTargetUser, is_deactivated: true }, error: null });
      const existChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(existChain);

      await expect(service.sendDirectRequest('u1', { targetUserId: 'u2', requestType: 'mentor_request' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw on duplicate request (23505)', async () => {
      const targetChain = createMockQueryChain({ data: mockTargetUser, error: null });
      const existChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'duplicate', code: '23505' } });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain);

      await expect(service.sendDirectRequest('u1', { targetUserId: 'u2', requestType: 'mentor_request' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDirectRequests', () => {
    it.skip('should return received requests', async () => {
      const chain = createMockQueryChain({ data: [mockRequest], error: null, count: 1 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getAllDirectRequestsForUser('u2', { type: 'received' } as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return sent requests', async () => {
      const chain = createMockQueryChain({ data: [mockRequest], error: null, count: 1 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getAllDirectRequestsForUser('u1', { type: 'sent' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getAllDirectRequestsForUser('u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should filter by status', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.getAllDirectRequestsForUser('u1', { status: 'pending' } as any);
      expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    });
  });

  describe('respondToDirectRequest', () => {
    it.skip('should accept a request', async () => {
      const requestChain = createMockQueryChain({ data: { ...mockRequest, target_user_id: 'u2' }, error: null });
      const updateChain = createMockQueryChain({ data: { ...mockRequest, status: 'accepted' }, error: null });
      const relInsertChain = createMockQueryChain({ data: { id: 'rel-1' }, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(relInsertChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.respondToDirectRequest('u2', { requestId: 'req-1', action: 'accept' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should decline a request', async () => {
      const requestChain = createMockQueryChain({ data: { ...mockRequest, target_user_id: 'u2' }, error: null });
      const updateChain = createMockQueryChain({ data: { ...mockRequest, status: 'declined' }, error: null });
      const notifChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(notifChain);

      const result = await service.respondToDirectRequest('u2', { requestId: 'req-1', action: 'decline' } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should throw if request not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.respondToDirectRequest('u2', { requestId: 'nope', action: 'accept' } as any)).rejects.toThrow(NotFoundException);
    });

    it.skip('should throw if not the target user', async () => {
      const chain = createMockQueryChain({ data: { ...mockRequest, target_user_id: 'other' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.respondToDirectRequest('u2', { requestId: 'req-1', action: 'accept' } as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw if request not pending', async () => {
      const chain = createMockQueryChain({ data: { ...mockRequest, target_user_id: 'u2', status: 'accepted' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.respondToDirectRequest('u2', { requestId: 'req-1', action: 'accept' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRequestMetrics', () => {
    it('should return request metrics', async () => {
      const sentChain = createMockQueryChain({ data: [
        { status: 'pending' }, { status: 'accepted' }, { status: 'declined' },
      ], error: null });
      const receivedChain = createMockQueryChain({ data: [
        { status: 'pending' }, { status: 'pending' },
      ], error: null });

      mockClient.from
        .mockReturnValueOnce(sentChain)
        .mockReturnValueOnce(receivedChain);

      const result = await service.getDirectRequestMetrics('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle empty metrics', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getDirectRequestMetrics('u1');
      expect(result.success).toBe(true);
    });
  });

  describe('markRequestAsRead', () => {
    it.skip('should mark request as read', async () => {
      const requestChain = createMockQueryChain({ data: { id: 'req-1', target_user_id: 'u2' }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.markDirectRequestAsRead('u2', 'req-1');
      expect(result.success).toBe(true);
    });

    it.skip('should throw if request not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.markDirectRequestAsRead('u2', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRequestById', () => {
    it.skip('should return request by ID', async () => {
      const chain = createMockQueryChain({ data: mockRequest, error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getDirectRequest('u1', 'req-1');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('req-1');
    });

    it('should throw if not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getDirectRequest('u1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });
});
