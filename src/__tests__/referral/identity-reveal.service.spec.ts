jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { IdentityRevealService } from '../../modules/referral/services/identity-reveal.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

const makeReveal = (overrides: Record<string, any> = {}) => ({
  id: 'r1',
  connection_id: 'c1',
  requester_id: 'u1',
  responder_id: 'u2',
  status: 'pending',
  requester_message_encrypted: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  responded_at: null,
  requester: { id: 'u1', username: 'User1', avatar: '🔥' },
  responder: { id: 'u2', username: 'User2', avatar: '💫' },
  ...overrides,
});

const makeConnection = (overrides: Record<string, any> = {}) => ({
  id: 'c1',
  sender_id: 'u1',
  receiver_id: 'u2',
  status: 'accepted',
  identity_revealed: false,
  ...overrides,
});

describe('IdentityRevealService', () => {
  let service: IdentityRevealService;
  let mockClient: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;
  let mockEmailService: any;
  let mockNotifications: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockEncryption = {
      encrypt: jest.fn((v: string) => 'enc_' + v),
      decrypt: jest.fn((v: string) => 'dec_' + v),
    };
    mockIdentityReveal = {
      decryptRealName: jest.fn().mockReturnValue('John Doe'),
    };
    mockEmailService = {
      sendIdentityRevealRequestEmail: jest.fn().mockResolvedValue({}),
      sendIdentityRevealAcceptedEmail: jest.fn().mockResolvedValue({}),
    };
    mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    service = new IdentityRevealService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
      mockEmailService,
      mockNotifications,
    );
  });

  describe('getUserReveals', () => {
    it('should return transformed reveals', async () => {
      const chain = createMockQueryChain({
        data: [makeReveal()],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserReveals('u1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('pending');
      expect(result.data[0].requester.username).toBe('Anonymous User');
    });

    it('should show real username when status is accepted', async () => {
      const chain = createMockQueryChain({
        data: [makeReveal({ status: 'accepted' })],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserReveals('u1');
      expect(result.data[0].requester.username).toBe('User1');
    });

    it('should decrypt requester message when present', async () => {
      const chain = createMockQueryChain({
        data: [makeReveal({ requester_message_encrypted: 'enc_hello' })],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserReveals('u1');
      expect(result.data[0].requesterMessage).toBe('dec_enc_hello');
    });

    it('should filter by status when provided', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserReveals('u1', 'pending');
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    });

    it('should not filter when status is all', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getUserReveals('u1', 'all');
      expect(chain.eq).not.toHaveBeenCalledWith('status', 'all');
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getUserReveals('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestReveal', () => {
    it('should create a reveal request successfully', async () => {
      const connChain = createMockQueryChain({ data: makeConnection(), error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'r1', status: 'pending' }, error: null });
      const responderChain = createMockQueryChain({
        data: { email: 'user2@test.com', username: 'User2', email_notifications: true },
        error: null,
      });
      const requesterChain = createMockQueryChain({ data: { username: 'User1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(responderChain)
        .mockReturnValueOnce(requesterChain);

      const result = await service.requestReveal('u1', 'c1', { message: 'Hi!' } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MESSAGING.REVEAL_SENT);
      expect(result.data.id).toBe('r1');
    });

    it('should throw NotFoundException if connection not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.requestReveal('u1', 'c1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user not part of connection', async () => {
      const connChain = createMockQueryChain({
        data: makeConnection({ sender_id: 'u3', receiver_id: 'u4' }),
        error: null,
      });
      mockClient.from.mockReturnValueOnce(connChain);

      await expect(service.requestReveal('u1', 'c1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if connection not accepted', async () => {
      const connChain = createMockQueryChain({
        data: makeConnection({ status: 'pending' }),
        error: null,
      });
      mockClient.from.mockReturnValueOnce(connChain);

      await expect(service.requestReveal('u1', 'c1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if identity already revealed', async () => {
      const connChain = createMockQueryChain({
        data: makeConnection({ identity_revealed: true }),
        error: null,
      });
      mockClient.from.mockReturnValueOnce(connChain);

      await expect(service.requestReveal('u1', 'c1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reveal already pending', async () => {
      const connChain = createMockQueryChain({ data: makeConnection(), error: null });
      const existingChain = createMockQueryChain({ data: { id: 'r1', status: 'pending' }, error: null });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(existingChain);

      await expect(service.requestReveal('u1', 'c1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reveal already accepted', async () => {
      const connChain = createMockQueryChain({ data: makeConnection(), error: null });
      const existingChain = createMockQueryChain({ data: { id: 'r1', status: 'accepted' }, error: null });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(existingChain);

      await expect(service.requestReveal('u1', 'c1', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should set responderId based on receiver when userId is sender', async () => {
      const connChain = createMockQueryChain({
        data: makeConnection({ sender_id: 'u1', receiver_id: 'u2' }),
        error: null,
      });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'r1', status: 'pending' }, error: null });
      const responderChain = createMockQueryChain({ data: { email: null }, error: null });
      const requesterChain = createMockQueryChain({ data: { username: 'User1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(responderChain)
        .mockReturnValueOnce(requesterChain);

      const result = await service.requestReveal('u1', 'c1', {} as any);
      expect(result.success).toBe(true);
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ responder_id: 'u2', requester_id: 'u1' }),
        ]),
      );
    });

    it('should skip email if responder has email_notifications disabled', async () => {
      const connChain = createMockQueryChain({ data: makeConnection(), error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'r1', status: 'pending' }, error: null });
      const responderChain = createMockQueryChain({
        data: { email: 'user2@test.com', username: 'User2', email_notifications: false },
        error: null,
      });
      const requesterChain = createMockQueryChain({ data: { username: 'User1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(responderChain)
        .mockReturnValueOnce(requesterChain);

      await service.requestReveal('u1', 'c1', {} as any);
      expect(mockEmailService.sendIdentityRevealRequestEmail).not.toHaveBeenCalled();
    });
  });

  describe('acceptReveal', () => {
    it('should accept a pending reveal request', async () => {
      const revealChain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'pending', connection_id: 'c1', requester_id: 'u1' },
        error: null,
      });
      const updateRevealChain = createMockQueryChain({ data: null, error: null });
      const updateConnChain = createMockQueryChain({
        data: { id: 'c1', identity_revealed: true },
        error: null,
      });
      const requesterChain = createMockQueryChain({
        data: { email: 'u1@test.com', username: 'User1', email_notifications: true },
        error: null,
      });
      const responderChain = createMockQueryChain({
        data: { username: 'User2', first_name_encrypted: 'enc_John', last_name_encrypted: 'enc_Doe' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(revealChain)
        .mockReturnValueOnce(updateRevealChain)
        .mockReturnValueOnce(updateConnChain)
        .mockReturnValueOnce(requesterChain)
        .mockReturnValueOnce(responderChain);

      const result = await service.acceptReveal('u2', 'r1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MESSAGING.REVEAL_ACCEPTED);
      expect(result.data.status).toBe('accepted');
      expect(result.data.connection.identityRevealed).toBe(true);
    });

    it('should throw NotFoundException if reveal not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.acceptReveal('u2', 'r1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the responder', async () => {
      const chain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'pending' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.acceptReveal('u1', 'r1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if reveal is not pending', async () => {
      const chain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'accepted' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.acceptReveal('u2', 'r1')).rejects.toThrow(BadRequestException);
    });

    it('should send email notification when requester has email enabled', async () => {
      const revealChain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'pending', connection_id: 'c1', requester_id: 'u1' },
        error: null,
      });
      const updateRevealChain = createMockQueryChain({ data: null, error: null });
      const updateConnChain = createMockQueryChain({ data: { id: 'c1' }, error: null });
      const requesterChain = createMockQueryChain({
        data: { email: 'u1@test.com', username: 'User1', email_notifications: true },
        error: null,
      });
      const responderChain = createMockQueryChain({
        data: { username: 'User2', first_name_encrypted: null, last_name_encrypted: null },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(revealChain)
        .mockReturnValueOnce(updateRevealChain)
        .mockReturnValueOnce(updateConnChain)
        .mockReturnValueOnce(requesterChain)
        .mockReturnValueOnce(responderChain);

      await service.acceptReveal('u2', 'r1');
      expect(mockEmailService.sendIdentityRevealAcceptedEmail).toHaveBeenCalled();
    });
  });

  describe('rejectReveal', () => {
    it('should reject a pending reveal request', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'pending', connection_id: 'c1', requester_id: 'u1' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'r1', status: 'rejected' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.rejectReveal('u2', 'r1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.MESSAGING.REVEAL_REJECTED);
      expect(result.data.status).toBe('rejected');
    });

    it('should throw NotFoundException if reveal not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.rejectReveal('u2', 'r1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the responder', async () => {
      const chain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'pending' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.rejectReveal('u1', 'r1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if reveal is not pending', async () => {
      const chain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'rejected' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.rejectReveal('u2', 'r1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on update error', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'r1', responder_id: 'u2', status: 'pending' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: { message: 'fail' } });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      await expect(service.rejectReveal('u2', 'r1')).rejects.toThrow(BadRequestException);
    });
  });
});
