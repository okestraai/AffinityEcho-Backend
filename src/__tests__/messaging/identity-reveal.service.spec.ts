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
import { IdentityRevealService } from '../../modules/messaging/services/identity-reveal.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('IdentityRevealService', () => {
  let service: IdentityRevealService;
  let mockClient: any;

  const mockConv = {
    id: 'conv-1',
    user1_id: 'u1',
    user2_id: 'u2',
    context_type: 'regular',
    context_id: null,
    user1_identity_revealed: false,
    user2_identity_revealed: false,
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
      getRevealedUserIds: jest.fn().mockResolvedValue([]),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockEmail = {
      sendIdentityRevealRequestEmail: jest.fn().mockResolvedValue(true),
      sendIdentityRevealAcceptedEmail: jest.fn().mockResolvedValue(true),
    };
    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    service = new IdentityRevealService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
      mockEmail,
      mockNotifications,
    );
  });

  describe('requestReveal', () => {
    it('should create identity reveal request', async () => {
      const convChain = createMockQueryChain({ data: mockConv, error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'reveal-1', status: 'pending', created_at: '2026-05-01' },
        error: null,
      });
      const responderChain = createMockQueryChain({
        data: {
          email: 'test@test.com',
          username: 'User2',
          email_notifications: true,
        },
        error: null,
      });
      const requesterChain = createMockQueryChain({
        data: { username: 'User1' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(responderChain)
        .mockReturnValueOnce(requesterChain);

      const result = await service.requestReveal('u1', {
        conversation_id: 'conv-1',
      } as any);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('pending');
    });

    it('should throw if conversation not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.requestReveal('u1', { conversation_id: 'nope' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not participant', async () => {
      const chain = createMockQueryChain({
        data: { ...mockConv, user1_id: 'other1', user2_id: 'other2' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.requestReveal('u1', { conversation_id: 'conv-1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if already revealed', async () => {
      const chain = createMockQueryChain({
        data: { ...mockConv, user1_identity_revealed: true },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.requestReveal('u1', { conversation_id: 'conv-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if pending request exists', async () => {
      const convChain = createMockQueryChain({ data: mockConv, error: null });
      const existingChain = createMockQueryChain({
        data: { id: 'reveal-old', status: 'pending' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(existingChain);

      await expect(
        service.requestReveal('u1', { conversation_id: 'conv-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('respondToReveal', () => {
    it.skip('should accept reveal request', async () => {
      // 1) fetch reveal (single) 2) update reveal 3) find conversations (array)
      // 4) update each conv 5) fetch requester profile 6) fetch responder profile
      const revealChain = createMockQueryChain({
        data: {
          id: 'reveal-1',
          requester_id: 'u1',
          responder_id: 'u2',
          status: 'pending',
        },
        error: null,
      });
      const arrayChain = createMockQueryChain({
        data: [{ id: 'conv-1' }],
        error: null,
      });
      const profileChain = createMockQueryChain({
        data: {
          id: 'u1',
          username: 'User1',
          email: 'test@test.com',
          email_notifications: true,
          first_name_encrypted: 'enc',
          last_name_encrypted: 'enc',
        },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(revealChain) // fetch reveal
        .mockReturnValueOnce(revealChain) // update reveal
        .mockReturnValueOnce(arrayChain) // find conversations
        .mockReturnValue(profileChain); // update conv + profiles

      const result = await service.respondToReveal('u2', {
        reveal_id: 'reveal-1',
        action: 'accept',
      } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should reject reveal request', async () => {
      const revealChain = createMockQueryChain({
        data: {
          id: 'reveal-1',
          requester_id: 'u1',
          responder_id: 'u2',
          status: 'pending',
        },
        error: null,
      });
      const profileChain = createMockQueryChain({
        data: { id: 'u1', username: 'User1' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(revealChain) // fetch reveal
        .mockReturnValueOnce(revealChain) // update reveal
        .mockReturnValue(profileChain); // profiles

      const result = await service.respondToReveal('u2', {
        reveal_id: 'reveal-1',
        action: 'reject',
      } as any);
      expect(result.success).toBe(true);
    });

    it('should throw if reveal not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.respondToReveal('u2', {
          reveal_id: 'nope',
          action: 'accept',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not the responder', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'reveal-1',
          requester_id: 'u1',
          responder_id: 'other',
          status: 'pending',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.respondToReveal('u2', {
          reveal_id: 'reveal-1',
          action: 'accept',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if not pending', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'reveal-1',
          requester_id: 'u1',
          responder_id: 'u2',
          status: 'accepted',
        },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.respondToReveal('u2', {
          reveal_id: 'reveal-1',
          action: 'accept',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRevealStatus', () => {
    it('should return reveal status for conversation', async () => {
      const defaultChain = createMockQueryChain({
        data: {
          ...mockConv,
          user1_identity_revealed: true,
          id: 'r1',
          status: 'accepted',
          requester_id: 'u1',
          responder_id: 'u2',
        },
        error: null,
      });
      mockClient.from.mockReturnValue(defaultChain);

      const result = await service.getRevealStatus('u1', 'conv-1');
      expect(result.success).toBe(true);
    });

    it('should throw if not participant', async () => {
      const chain = createMockQueryChain({
        data: { ...mockConv, user1_id: 'other1', user2_id: 'other2' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getRevealStatus('u1', 'conv-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('cancelReveal', () => {
    it('should cancel own pending reveal', async () => {
      const revealChain = createMockQueryChain({
        data: { id: 'reveal-1', requester_id: 'u1', status: 'pending' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'reveal-1', status: 'cancelled' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(revealChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.cancelReveal('u1', 'reveal-1');
      expect(result.success).toBe(true);
    });

    it('should throw if not the requester', async () => {
      const chain = createMockQueryChain({
        data: { id: 'reveal-1', requester_id: 'other', status: 'pending' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.cancelReveal('u1', 'reveal-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
