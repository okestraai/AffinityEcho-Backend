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

  describe('markAsRead', () => {
    it('should mark messages as read successfully', async () => {
      const convChain = createMockQueryChain({ data: mockConv, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const countChain = createMockQueryChain({ data: null, error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(countChain);

      const result = await service.markAsRead('u1', 'msg-1', 'conv-1');
      expect(result.success).toBe(true);
      expect(result.data.message_id).toBe('msg-1');
      expect(result.data.unread_count).toBe(0);
    });

    it('should throw ForbiddenException if not participant', async () => {
      const chain = createMockQueryChain({
        data: { user1_id: 'other1', user2_id: 'other2' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.markAsRead('u1', 'msg-1', 'conv-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if conversation not found', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.markAsRead('u1', 'msg-1', 'conv-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count via RPC', async () => {
      const rpcResult = Promise.resolve({ data: { get_unread_message_count: 5 }, error: null });
      mockClient.rpc = jest.fn().mockReturnValueOnce(rpcResult);

      const result = await service.getUnreadCount('u1');
      expect(result.success).toBe(true);
      expect(result.data.unread_count).toBe(5);
    });

    it('should fallback when RPC fails', async () => {
      const rpcResult = Promise.resolve({ data: null, error: { message: 'rpc not found' } });
      mockClient.rpc = jest.fn().mockReturnValueOnce(rpcResult);
      const convChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(convChain);

      const result = await service.getUnreadCount('u1');
      expect(result.success).toBe(true);
      expect(result.data.unread_count).toBe(0);
    });
  });

  describe('deleteMessage', () => {
    it('should delete message successfully', async () => {
      const convChain = createMockQueryChain({ data: { id: 'conv-1', user1_id: 'u1', user2_id: 'u2' }, error: null });
      const msgChain = createMockQueryChain({ data: { id: 'msg-1', conversation_id: 'conv-1' }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.deleteMessage('u1', 'msg-1', 'conv-1');
      expect(result.success).toBe(true);
      expect(result.data.message_id).toBe('msg-1');
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.deleteMessage('u1', 'msg-1', 'conv-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not participant', async () => {
      const chain = createMockQueryChain({
        data: { id: 'conv-1', user1_id: 'other1', user2_id: 'other2' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.deleteMessage('u1', 'msg-1', 'conv-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if message not found', async () => {
      const convChain = createMockQueryChain({ data: { id: 'conv-1', user1_id: 'u1', user2_id: 'u2' }, error: null });
      const msgChain = createMockQueryChain({ data: null, error: { message: 'not found' } });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain);

      await expect(service.deleteMessage('u1', 'msg-1', 'conv-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('editMessage', () => {
    const editDto = {
      conversation_id: 'conv-1',
      content_encrypted: 'enc_updated',
    };

    it('should edit message successfully', async () => {
      const convChain = createMockQueryChain({ data: { ...mockConv, is_active: true }, error: null });
      const msgChain = createMockQueryChain({
        data: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'u1', content_type: 'text' },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { id: 'msg-1', conversation_id: 'conv-1', content_encrypted: 'enc_updated', is_edited: true, edited_at: '2026-01-01', updated_at: '2026-01-01' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.editMessage('u1', 'msg-1', editDto as any);
      expect(result.success).toBe(true);
      expect(result.data.is_edited).toBe(true);
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.editMessage('u1', 'msg-1', editDto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not sender', async () => {
      const convChain = createMockQueryChain({ data: { ...mockConv, is_active: true }, error: null });
      const msgChain = createMockQueryChain({
        data: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'other', content_type: 'text' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain);

      await expect(service.editMessage('u1', 'msg-1', editDto as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-text message', async () => {
      const convChain = createMockQueryChain({ data: { ...mockConv, is_active: true }, error: null });
      const msgChain = createMockQueryChain({
        data: { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'u1', content_type: 'image' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain);

      await expect(service.editMessage('u1', 'msg-1', editDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('setTypingStatus', () => {
    it('should return typing status successfully', async () => {
      const convChain = createMockQueryChain({ data: { ...mockConv, is_active: true }, error: null });
      const profileChain = createMockQueryChain({ data: { id: 'u1', username: 'User1' }, error: null });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.setTypingStatus('u1', 'conv-1', true);
      expect(result.success).toBe(true);
      expect(result.data.is_typing).toBe(true);
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.setTypingStatus('u1', 'conv-1', true)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not participant', async () => {
      const chain = createMockQueryChain({
        data: { user1_id: 'other1', user2_id: 'other2', is_active: true },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.setTypingStatus('u1', 'conv-1', true)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTypingStatus', () => {
    it('should return typing status', async () => {
      const convChain = createMockQueryChain({ data: mockConv, error: null });
      mockClient.from.mockReturnValueOnce(convChain);

      const result = await service.getTypingStatus('u1', 'conv-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getTypingStatus('u1', 'conv-1')).rejects.toThrow(NotFoundException);
    });
  });
});
