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
import { ReferralConnectionsService } from '../../modules/referral/services/referral-connections.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('ReferralConnectionsService', () => {
  let service: ReferralConnectionsService;
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
    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    const mockEmail = {
      sendConnectionRequestEmail: jest.fn().mockResolvedValue(true),
      sendConnectionAcceptedEmail: jest.fn().mockResolvedValue(true),
    };
    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    service = new ReferralConnectionsService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
      mockEmail,
      mockNotifications,
    );
  });

  describe('getUserConnections', () => {
    it('should return user connections', async () => {
      const sentChain = createMockQueryChain({
        data: [
          {
            id: 'c1',
            status: 'accepted',
            sender_id: 'u1',
            receiver_id: 'u2',
            receiver: { id: 'u2', username: 'Receiver', avatar: '📚' },
            referral_posts: null,
            identity_revealed: false,
          },
        ],
        error: null,
      });
      const receivedChain = createMockQueryChain({
        data: [
          {
            id: 'c2',
            status: 'pending',
            sender_id: 'u3',
            receiver_id: 'u1',
            sender: { id: 'u3', username: 'Sender', avatar: '🔥' },
            referral_posts: null,
            identity_revealed: false,
          },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sentChain)
        .mockReturnValueOnce(receivedChain);

      const result = await service.getUserConnections('u1');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should filter by status', async () => {
      const sentChain = createMockQueryChain({ data: [], error: null });
      const receivedChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(sentChain)
        .mockReturnValueOnce(receivedChain);

      await service.getUserConnections('u1', 'pending');
      expect(sentChain.eq).toHaveBeenCalledWith('status', 'pending');
    });

    it('should handle empty connections', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getUserConnections('u1');
      expect(result.success).toBe(true);
    });
  });

  describe('sendConnectionRequest', () => {
    it('should send connection request', async () => {
      const postChain = createMockQueryChain({
        data: { id: 'r1', user_id: 'u2', status: 'open' },
        error: null,
      });
      const existChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'conn-1', status: 'pending' },
        error: null,
      });
      const receiverChain = createMockQueryChain({
        data: {
          email: 'test@test.com',
          username: 'Poster',
          email_notifications: true,
        },
        error: null,
      });
      const senderChain = createMockQueryChain({
        data: { username: 'Sender' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(postChain)
        .mockReturnValueOnce(existChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(receiverChain)
        .mockReturnValueOnce(senderChain);

      const result = await service.sendConnectionRequest('u1', 'r1', {
        message: 'Interested',
      } as any);
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.REFERRAL.CONNECTION_SENT);
    });

    it('should throw if referral not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.sendConnectionRequest('u1', 'nope', {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if sending to own post', async () => {
      const chain = createMockQueryChain({
        data: { id: 'r1', user_id: 'u1', status: 'open' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.sendConnectionRequest('u1', 'r1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if post is not open', async () => {
      const chain = createMockQueryChain({
        data: { id: 'r1', user_id: 'u2', status: 'closed' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.sendConnectionRequest('u1', 'r1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if already connected', async () => {
      const postChain = createMockQueryChain({
        data: { id: 'r1', user_id: 'u2', status: 'open' },
        error: null,
      });
      const existChain = createMockQueryChain({
        data: { id: 'existing' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(postChain)
        .mockReturnValueOnce(existChain);

      await expect(
        service.sendConnectionRequest('u1', 'r1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptConnection', () => {
    it('should accept connection', async () => {
      const connChain = createMockQueryChain({
        data: {
          id: 'c1',
          sender_id: 'u1',
          receiver_id: 'u2',
          referral_post_id: 'r1',
          status: 'pending',
          referral_posts: { type: 'request', available_slots: null },
        },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'c1', status: 'accepted' },
        error: null,
      });
      const senderChain = createMockQueryChain({
        data: {
          email: 'test@test.com',
          username: 'Sender',
          email_notifications: true,
        },
        error: null,
      });
      const receiverChain = createMockQueryChain({
        data: { username: 'Receiver' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(senderChain)
        .mockReturnValueOnce(receiverChain);

      const result = await service.acceptConnection('u2', 'c1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.REFERRAL.CONNECTION_ACCEPTED);
    });

    it('should throw if not the receiver', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'c1',
          sender_id: 'u1',
          receiver_id: 'other',
          status: 'pending',
        },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.acceptConnection('u2', 'c1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw if not pending', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'c1',
          sender_id: 'u1',
          receiver_id: 'u2',
          status: 'accepted',
        },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.acceptConnection('u2', 'c1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if connection not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.acceptConnection('u2', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rejectConnection', () => {
    it('should reject connection', async () => {
      const connChain = createMockQueryChain({
        data: {
          id: 'c1',
          sender_id: 'u1',
          receiver_id: 'u2',
          status: 'pending',
        },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'c1', status: 'rejected' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(connChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.rejectConnection('u2', 'c1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.REFERRAL.CONNECTION_REJECTED);
    });
  });

  describe('getConnectionById', () => {
    it('should return connection by ID', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'c1',
          sender_id: 'u1',
          receiver_id: 'u2',
          status: 'accepted',
          identity_revealed: false,
          sender: { id: 'u1', username: 'Sender', avatar: '🔥' },
          receiver: { id: 'u2', username: 'Receiver', avatar: '📚' },
          referral_posts: {
            id: 'r1',
            title_encrypted: 'enc_title',
            company_encrypted: 'enc_company',
            job_title_encrypted: null,
          },
        },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getConnectionById('u1', 'c1');
      expect(result.success).toBe(true);
    });

    it('should throw if not participant', async () => {
      const chain = createMockQueryChain({
        data: {
          id: 'c1',
          sender_id: 'other1',
          receiver_id: 'other2',
          status: 'accepted',
        },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getConnectionById('u1', 'c1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw if not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.getConnectionById('u1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
