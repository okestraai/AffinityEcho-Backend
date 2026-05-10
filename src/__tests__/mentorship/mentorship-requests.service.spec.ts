jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MentorshipRequestsService } from '../../modules/mentorship/services/mentorship-requests.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
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
    id: 'u2',
    username: 'Mentor',
    avatar: '📚',
    is_willing_to_mentor: true,
    mentoring_as: 'mentor',
    is_deleted: false,
    is_deactivated: false,
    is_company_verified: true,
  };

  const mockRequest = {
    id: 'req-1',
    requester_id: 'u1',
    target_user_id: 'u2',
    request_type: 'mentor_request',
    status: 'pending',
    message: 'Hi',
    created_at: '2026-05-01',
    requester: { id: 'u1', username: 'Mentee', avatar: '🔥' },
    target_user: { id: 'u2', username: 'Mentor', avatar: '📚' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
      markActionTakenByReference: jest.fn().mockResolvedValue({}),
    };
    mockEncryption = {
      encrypt: jest.fn((v) => 'enc_' + v),
      decrypt: jest.fn((v) => 'dec_' + v),
    };
    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
      decryptRealName: jest.fn().mockReturnValue(null),
    };

    service = new MentorshipRequestsService(
      createMockConfigService() as any,
      mockNotifications,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('sendDirectRequest', () => {
    it('should send a mentor request', async () => {
      // 1. Parallel: user_profiles + checkExistingRequests
      const targetChain = createMockQueryChain({
        data: mockTargetUser,
        error: null,
      });
      const existChain = createMockQueryChain({ data: [], error: null });
      // 2. insert request
      const insertChain = createMockQueryChain({
        data: mockRequest,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.sendDirectRequest('u1', {
        targetUserId: 'u2',
        requestType: 'mentor_request',
        message: 'Hi',
      } as any);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should throw if target user not found', async () => {
      const targetChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      const existChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain);

      await expect(
        service.sendDirectRequest('u1', {
          targetUserId: 'nope',
          requestType: 'mentor_request',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if target is deactivated', async () => {
      const targetChain = createMockQueryChain({
        data: { ...mockTargetUser, is_deactivated: true },
        error: null,
      });
      const existChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain);

      await expect(
        service.sendDirectRequest('u1', {
          targetUserId: 'u2',
          requestType: 'mentor_request',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw on duplicate request (23505)', async () => {
      const targetChain = createMockQueryChain({
        data: mockTargetUser,
        error: null,
      });
      const existChain = createMockQueryChain({ data: [], error: null });
      const insertChain = createMockQueryChain({
        data: null,
        error: { message: 'duplicate', code: '23505' },
      });

      mockClient.from
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain);

      await expect(
        service.sendDirectRequest('u1', {
          targetUserId: 'u2',
          requestType: 'mentor_request',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDirectRequests', () => {
    it('should return received requests', async () => {
      const chain = createMockQueryChain({
        data: [mockRequest],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getAllDirectRequestsForUser('u2', {} as any);
      expect(result.success).toBe(true);
      expect(result.data.requests).toHaveLength(1);
    });

    it('should return sent requests', async () => {
      const chain = createMockQueryChain({
        data: [mockRequest],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getAllDirectRequestsForUser('u1', {} as any);
      expect(result.success).toBe(true);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getAllDirectRequestsForUser('u1', {} as any);
      expect(result.success).toBe(true);
      expect(result.data.requests).toEqual([]);
    });

    it('should filter by status', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.getAllDirectRequestsForUser('u1', {
        status: 'pending',
      } as any);
      expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    });
  });

  describe('respondToDirectRequest', () => {
    it('should accept a request', async () => {
      const requestChain = createMockQueryChain({
        data: {
          ...mockRequest,
          target_user_id: 'u2',
          request_type: 'mentor_request',
        },
        error: null,
      });
      const relInsertChain = createMockQueryChain({
        data: { id: 'rel-1' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { ...mockRequest, status: 'accepted' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(relInsertChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.respondToDirectRequest('req-1', 'u2', {
        action: 'accept',
      } as any);
      expect(result.success).toBe(true);
    });

    it('should decline a request', async () => {
      const requestChain = createMockQueryChain({
        data: { ...mockRequest, target_user_id: 'u2' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { ...mockRequest, status: 'declined' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.respondToDirectRequest('req-1', 'u2', {
        action: 'decline',
      } as any);
      expect(result.success).toBe(true);
    });

    it('should throw if request not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.respondToDirectRequest('nope', 'u2', {
          action: 'accept',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not the target user', async () => {
      const chain = createMockQueryChain({
        data: { ...mockRequest, target_user_id: 'other' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.respondToDirectRequest('req-1', 'u2', {
          action: 'accept',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if request not pending', async () => {
      const chain = createMockQueryChain({
        data: { ...mockRequest, target_user_id: 'u2', status: 'accepted' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.respondToDirectRequest('req-1', 'u2', {
          action: 'accept',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRequestMetrics', () => {
    it('should return request metrics', async () => {
      const chain = createMockQueryChain({
        data: [
          { status: 'pending', requester_id: 'u1', target_user_id: 'u2' },
          { status: 'accepted', requester_id: 'u1', target_user_id: 'u2' },
          { status: 'pending', requester_id: 'u3', target_user_id: 'u1' },
        ],
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

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
    it('should mark request as read', async () => {
      // Spy on getDirectRequest to break circular recursion
      // (markDirectRequestAsRead → getDirectRequest → markDirectRequestAsRead)
      // markDirectRequestAsRead destructures { data: request } from getDirectRequest's return
      jest.spyOn(service, 'getDirectRequest').mockResolvedValue({
        data: { ...mockRequest, is_read_by_requester: false, is_read_by_target: false },
      } as any);

      const updateChain = createMockQueryChain({
        data: { ...mockRequest, is_read_by_target: true },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(updateChain);

      const result = await service.markDirectRequestAsRead('req-1', 'u2');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Request marked as read');
    });

    it('should throw if request not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.markDirectRequestAsRead('nope', 'u2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRequestById', () => {
    it('should return request by ID', async () => {
      const chain = createMockQueryChain({ data: mockRequest, error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getDirectRequest('req-1');
      expect(result.id).toBe('req-1');
    });

    it('should throw if not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getDirectRequest('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDirectRequestsByReceiver', () => {
    it('should return received requests', async () => {
      const chain = createMockQueryChain({
        data: [mockRequest],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getDirectRequestsByReceiver('u2', {});
      expect(result.success).toBe(true);
      expect(result.data.requests).toHaveLength(1);
    });

    it('should handle empty received requests', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getDirectRequestsByReceiver('u2', {});
      expect(result.success).toBe(true);
      expect(result.data.requests).toEqual([]);
    });

    it('should apply status filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.getDirectRequestsByReceiver('u2', { status: 'pending' });
      expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getDirectRequestsByReceiver('u2', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDirectRequestsBySender', () => {
    it('should return sent requests', async () => {
      const chain = createMockQueryChain({
        data: [mockRequest],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getDirectRequestsBySender('u1', {});
      expect(result.success).toBe(true);
      expect(result.data.requests).toHaveLength(1);
    });

    it('should apply requestType filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.getDirectRequestsBySender('u1', { requestType: 'mentor_request' } as any);
      expect(chain.eq).toHaveBeenCalledWith('request_type', 'mentor_request');
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getDirectRequestsBySender('u1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkIfRequestSentToUser', () => {
    it('should return hasSentRequest false when no requests exist', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.checkIfRequestSentToUser('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.hasSentRequest).toBe(false);
    });

    it('should return hasSentRequest true when pending request exists', async () => {
      const chain = createMockQueryChain({
        data: [{ ...mockRequest, requester_id: 'u1', target_user_id: 'u2', status: 'pending' }],
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.checkIfRequestSentToUser('u1', 'u2');
      expect(result.success).toBe(true);
      expect(result.hasSentRequest).toBe(true);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.checkIfRequestSentToUser('u1', 'u2')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteDirectRequest', () => {
    it('should delete a pending request owned by user', async () => {
      const requestChain = createMockQueryChain({
        data: { requester_id: 'u1', status: 'pending' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(requestChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.deleteDirectRequest('req-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Request deleted successfully');
    });

    it('should throw NotFoundException if request not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteDirectRequest('nope', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not the requester', async () => {
      const chain = createMockQueryChain({ data: { requester_id: 'other', status: 'pending' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteDirectRequest('req-1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if request is not pending', async () => {
      const chain = createMockQueryChain({ data: { requester_id: 'u1', status: 'accepted' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteDirectRequest('req-1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyMentors', () => {
    it('should return list of mentors', async () => {
      const sentChain = createMockQueryChain({ data: [], error: null });
      const receivedChain = createMockQueryChain({ data: [], error: null });
      const relChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(sentChain)
        .mockReturnValueOnce(receivedChain)
        .mockReturnValueOnce(relChain);

      const result = await service.getMyMentors('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should include mentors from sent mentor requests', async () => {
      const sentChain = createMockQueryChain({
        data: [{
          id: 'req-1',
          requester_id: 'u1',
          target_user_id: 'u2',
          request_type: 'mentor_request',
          status: 'accepted',
          message: 'Hello',
          responded_at: '2026-05-01',
          target_user: { id: 'u2', username: 'Mentor1', avatar: '📚', company_encrypted: 'enc', first_name_encrypted: null, last_name_encrypted: null },
        }],
        error: null,
      });
      const receivedChain = createMockQueryChain({ data: [], error: null });
      const relChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(sentChain)
        .mockReturnValueOnce(receivedChain)
        .mockReturnValueOnce(relChain);

      const result = await service.getMyMentors('u1');
      expect(result.success).toBe(true);
    });
  });
});
