import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MessagingService } from '../../modules/messaging/services/messaging.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

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

describe('MessagingService', () => {
  let service: MessagingService;
  let mockClient: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;
  let mockEmailService: any;
  let mockNotifications: any;

  const mockConv = {
    id: 'conv-1',
    user1_id: 'u1',
    user2_id: 'u2',
    is_active: true,
    context_type: 'regular',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockEncryption = {
      encrypt: jest.fn((t: string) => 'enc_' + t),
      decrypt: jest.fn((t: string) => 'dec_' + t),
    };
    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
      resolveNotificationName: jest.fn().mockResolvedValue('TestUser'),
    };
    mockEmailService = { sendEmail: jest.fn().mockResolvedValue({}) };
    mockNotifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new MessagingService(
      createMockConfigService() as any,
      mockEncryption,
      mockIdentityReveal,
      mockEmailService,
      mockNotifications,
    );
  });

  describe('sendMessage', () => {
    const dto = {
      conversation_id: 'conv-1',
      content_encrypted: 'enc_hello',
      content_type: 'text',
      chat_type: 'regular',
    };

    it('should send message successfully', async () => {
      // 1. get conversation
      const convChain = createMockQueryChain({ data: mockConv, error: null });
      // 2. insert message
      const msgChain = createMockQueryChain({
        data: {
          id: 'msg-1',
          conversation_id: 'conv-1',
          content_encrypted: 'enc_hello',
          created_at: '2026-01-01',
        },
        error: null,
      });
      // 3. update conversation last_message_at
      const updateChain = createMockQueryChain({ data: null, error: null });
      // 4. get sender profile
      const senderChain = createMockQueryChain({
        data: { username: 'User1', avatar: '🔥', is_company_verified: false },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(senderChain);

      const result = await service.sendMessage('u1', dto as any);
      expect(result.success).toBe(true);
      expect(result.data.message_id).toBe('msg-1');
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found', code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.sendMessage('u1', dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if not participant', async () => {
      const chain = createMockQueryChain({
        data: { ...mockConv, user1_id: 'other1', user2_id: 'other2' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.sendMessage('u1', dto as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw if conversation not active', async () => {
      const chain = createMockQueryChain({
        data: { ...mockConv, is_active: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.sendMessage('u1', dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if chat type mismatch', async () => {
      const chain = createMockQueryChain({ data: mockConv, error: null });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(
        service.sendMessage('u1', { ...dto, chat_type: 'mentorship' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
