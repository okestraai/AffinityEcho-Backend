import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { NookMessagesService } from './nook-messages.service';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../../__tests__/helpers/mock-supabase';
import { supabaseAdmin } from '../../../database/supabase.client';

jest.mock('../../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.mock('../../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('NookMessagesService', () => {
  let service: NookMessagesService;
  let mockClient: any;
  let mockConfigService: any;
  let mockIdentityReveal: any;
  let mockMentionService: any;
  let mockNotificationsService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockConfigService = createMockConfigService();
    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
    };
    mockMentionService = {
      parseMentions: jest.fn().mockReturnValue([]),
      processMentions: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationsService = {
      createNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    service = new NookMessagesService(
      mockConfigService as any,
      mockIdentityReveal as any,
      mockMentionService as any,
      mockNotificationsService as any,
    );
  });

  describe('getMessages', () => {
    const nookId = 'nook-001';
    const userId = 'user-001';

    it('should return paginated messages with replies', async () => {
      const nook = { id: nookId, is_active: true, is_locked: false, expires_at: new Date(Date.now() + 86400000).toISOString() };
      const messages = [
        {
          id: 'msg-001',
          nook_id: nookId,
          user_id: 'user-002',
          parent_message_id: null,
          content: 'Hello world',
          is_anonymous: true,
          user: { id: 'user-002', username: 'alice', avatar: 'avatar1', first_name_encrypted: null, last_name_encrypted: null },
        },
        {
          id: 'msg-002',
          nook_id: nookId,
          user_id: 'user-003',
          parent_message_id: null,
          content: 'Another message',
          is_anonymous: false,
          user: { id: 'user-003', username: 'bob', avatar: 'avatar2', first_name_encrypted: null, last_name_encrypted: null },
        },
      ];
      const replies = [
        {
          id: 'reply-001',
          nook_id: nookId,
          user_id: userId,
          parent_message_id: 'msg-001',
          content: 'Reply to hello',
          is_anonymous: true,
          user: { id: userId, username: 'me', avatar: 'avatar-me', first_name_encrypted: null, last_name_encrypted: null },
        },
      ];

      const nookChain = createMockQueryChain({ data: nook, error: null });
      const messagesChain = createMockQueryChain({ data: messages, error: null, count: 2 });
      const repliesChain = createMockQueryChain({ data: replies, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)      // nooks check
        .mockReturnValueOnce(messagesChain)  // nook_messages (top-level)
        .mockReturnValueOnce(repliesChain);  // nook_messages (replies)

      const result = await service.getMessages(nookId, { page: 1, limit: 20, sortOrder: 'asc' }, userId);

      expect(result.success).toBe(true);
      expect(result.data.messages).toHaveLength(2);
      expect(result.data.pagination).toEqual({ page: 1, limit: 20, total: 2 });

      // First message should have the reply attached
      expect(result.data.messages[0].replies).toHaveLength(1);
      expect(result.data.messages[0].replies[0].id).toBe('reply-001');

      // Second message has no replies
      expect(result.data.messages[1].replies).toHaveLength(0);

      // Verify identity reveal was called with collected user IDs
      expect(mockIdentityReveal.getRevealedUserIds).toHaveBeenCalledWith(
        userId,
        expect.arrayContaining(['user-002', 'user-003', userId]),
      );

      // Verify supabase calls
      expect(mockClient.from).toHaveBeenCalledWith('nooks');
      expect(mockClient.from).toHaveBeenCalledWith('nook_messages');
    });

    it('should throw NotFoundException when nook not found', async () => {
      const nookChain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(nookChain);

      await expect(
        service.getMessages(nookId, { page: 1, limit: 20 }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when message query fails', async () => {
      const nook = { id: nookId, is_active: true, is_locked: false, expires_at: new Date(Date.now() + 86400000).toISOString() };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      const messagesChain = createMockQueryChain({ data: null, error: { message: 'query failed' }, count: 0 });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(messagesChain);

      await expect(
        service.getMessages(nookId, { page: 1, limit: 20 }, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle empty messages list', async () => {
      const nook = { id: nookId, is_active: true, is_locked: false, expires_at: new Date(Date.now() + 86400000).toISOString() };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      const messagesChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(messagesChain);

      const result = await service.getMessages(nookId, { page: 1, limit: 20 }, userId);

      expect(result.success).toBe(true);
      expect(result.data.messages).toHaveLength(0);
      expect(result.data.pagination.total).toBe(0);
    });

    it('should use default query params when not provided', async () => {
      const nook = { id: nookId, is_active: true, is_locked: false, expires_at: new Date(Date.now() + 86400000).toISOString() };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      const messagesChain = createMockQueryChain({ data: [], error: null, count: 0 });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(messagesChain);

      const result = await service.getMessages(nookId, {}, userId);

      expect(result.data.pagination).toEqual({ page: 1, limit: 20, total: 0 });
    });
  });

  describe('createMessage', () => {
    const nookId = 'nook-001';
    const userId = 'user-001';
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    it('should create message and update nook stats', async () => {
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: false,
        expires_at: futureDate,
        messages_count: 5,
      };
      const createdMessage = {
        id: 'msg-new',
        nook_id: nookId,
        user_id: userId,
        content: 'Test message',
        is_anonymous: true,
        created_at: new Date().toISOString(),
      };

      const nookChain = createMockQueryChain({ data: nook, error: null });
      const insertChain = createMockQueryChain({ data: createdMessage, error: null });
      const recentCountChain = createMockQueryChain({ data: null, error: null, count: 2 });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)       // nook check
        .mockReturnValueOnce(insertChain)     // insert message
        .mockReturnValueOnce(recentCountChain) // count recent messages
        .mockReturnValueOnce(updateChain);    // update nook stats

      const result = await service.createMessage(
        nookId,
        { content: 'Test message', is_anonymous: true },
        userId,
      );

      expect(result.success).toBe(true);
      expect(result.data.message).toEqual(createdMessage);
      expect(result.message).toBe('Message posted successfully');

      // Verify the insert was called on nook_messages
      expect(mockClient.from).toHaveBeenCalledWith('nook_messages');
      // Verify the nook stats update
      expect(mockClient.from).toHaveBeenCalledWith('nooks');
    });

    it('should throw NotFoundException when nook not found', async () => {
      const nookChain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(nookChain);

      await expect(
        service.createMessage(nookId, { content: 'Test' }, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when nook is locked', async () => {
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: true,
        expires_at: futureDate,
        messages_count: 5,
      };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      mockClient.from.mockReturnValueOnce(nookChain);

      await expect(
        service.createMessage(nookId, { content: 'Test' }, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when nook is inactive', async () => {
      const nook = {
        id: nookId,
        is_active: false,
        is_locked: false,
        expires_at: futureDate,
        messages_count: 5,
      };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      mockClient.from.mockReturnValueOnce(nookChain);

      await expect(
        service.createMessage(nookId, { content: 'Test' }, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when nook has expired', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: false,
        expires_at: pastDate,
        messages_count: 5,
      };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      mockClient.from.mockReturnValueOnce(nookChain);

      await expect(
        service.createMessage(nookId, { content: 'Test' }, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when parent message not found', async () => {
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: false,
        expires_at: futureDate,
        messages_count: 5,
      };
      const nookChain = createMockQueryChain({ data: nook, error: null });
      const parentCheckChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(parentCheckChain);

      await expect(
        service.createMessage(
          nookId,
          { content: 'Reply', parent_message_id: 'nonexistent-id' },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate parent message before creating a reply', async () => {
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: false,
        expires_at: futureDate,
        messages_count: 5,
      };
      const parentMessage = { id: 'parent-msg' };
      const createdMessage = {
        id: 'msg-reply',
        nook_id: nookId,
        user_id: userId,
        content: 'Reply text',
        is_anonymous: true,
        created_at: new Date().toISOString(),
      };

      const nookChain = createMockQueryChain({ data: nook, error: null });
      const parentCheckChain = createMockQueryChain({ data: parentMessage, error: null });
      const insertChain = createMockQueryChain({ data: createdMessage, error: null });
      const recentCountChain = createMockQueryChain({ data: null, error: null, count: 1 });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(parentCheckChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(recentCountChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.createMessage(
        nookId,
        { content: 'Reply text', parent_message_id: 'parent-msg' },
        userId,
      );

      expect(result.success).toBe(true);
      expect(result.data.message).toEqual(createdMessage);
    });

    it('should set temperature to hot when 10+ recent messages', async () => {
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: false,
        expires_at: futureDate,
        messages_count: 15,
      };
      const createdMessage = {
        id: 'msg-new',
        nook_id: nookId,
        user_id: userId,
        content: 'Hot topic',
        is_anonymous: true,
        created_at: new Date().toISOString(),
      };

      const nookChain = createMockQueryChain({ data: nook, error: null });
      const insertChain = createMockQueryChain({ data: createdMessage, error: null });
      const recentCountChain = createMockQueryChain({ data: null, error: null, count: 12 });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(recentCountChain)
        .mockReturnValueOnce(updateChain);

      await service.createMessage(nookId, { content: 'Hot topic' }, userId);

      // The update call should include temperature 'hot'
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 'hot', messages_count: 16 }),
      );
    });

    it('should set temperature to warm when 3-9 recent messages', async () => {
      const nook = {
        id: nookId,
        is_active: true,
        is_locked: false,
        expires_at: futureDate,
        messages_count: 4,
      };
      const createdMessage = {
        id: 'msg-new',
        nook_id: nookId,
        user_id: userId,
        content: 'Warm topic',
        is_anonymous: true,
        created_at: new Date().toISOString(),
      };

      const nookChain = createMockQueryChain({ data: nook, error: null });
      const insertChain = createMockQueryChain({ data: createdMessage, error: null });
      const recentCountChain = createMockQueryChain({ data: null, error: null, count: 5 });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(recentCountChain)
        .mockReturnValueOnce(updateChain);

      await service.createMessage(nookId, { content: 'Warm topic' }, userId);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 'warm', messages_count: 5 }),
      );
    });
  });

  describe('deleteMessage', () => {
    const nookId = 'nook-001';
    const messageId = 'msg-001';
    const userId = 'user-001';

    it('should delete message by author', async () => {
      const message = {
        id: messageId,
        user_id: userId,
        nook_id: nookId,
        nook: { creator_id: 'other-user' },
      };
      const nookData = { messages_count: 10 };

      const fetchChain = createMockQueryChain({ data: message, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const nookCountChain = createMockQueryChain({ data: nookData, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)     // fetch message
        .mockReturnValueOnce(deleteChain)    // delete message
        .mockReturnValueOnce(nookCountChain) // get nook count
        .mockReturnValueOnce(updateChain);   // update nook count

      const result = await service.deleteMessage(nookId, messageId, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message deleted successfully');
      expect(mockClient.from).toHaveBeenCalledWith('nook_messages');
    });

    it('should allow nook creator to delete any message', async () => {
      const nookCreatorId = 'nook-creator';
      const message = {
        id: messageId,
        user_id: 'other-author',
        nook_id: nookId,
        nook: { creator_id: nookCreatorId },
      };
      const nookData = { messages_count: 10 };

      const fetchChain = createMockQueryChain({ data: message, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const nookCountChain = createMockQueryChain({ data: nookData, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(nookCountChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.deleteMessage(nookId, messageId, nookCreatorId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Message deleted successfully');
    });

    it('should throw ForbiddenException when not author or nook creator', async () => {
      const message = {
        id: messageId,
        user_id: 'original-author',
        nook_id: nookId,
        nook: { creator_id: 'nook-creator' },
      };

      const fetchChain = createMockQueryChain({ data: message, error: null });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.deleteMessage(nookId, messageId, 'random-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when message not found', async () => {
      const fetchChain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.deleteMessage(nookId, messageId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when delete operation fails', async () => {
      const message = {
        id: messageId,
        user_id: userId,
        nook_id: nookId,
        nook: { creator_id: 'other-user' },
      };

      const fetchChain = createMockQueryChain({ data: message, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: { message: 'delete failed' } });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      await expect(
        service.deleteMessage(nookId, messageId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should decrement nook messages_count after deletion', async () => {
      const message = {
        id: messageId,
        user_id: userId,
        nook_id: nookId,
        nook: { creator_id: 'other-user' },
      };
      const nookData = { messages_count: 5 };

      const fetchChain = createMockQueryChain({ data: message, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const nookCountChain = createMockQueryChain({ data: nookData, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(nookCountChain)
        .mockReturnValueOnce(updateChain);

      await service.deleteMessage(nookId, messageId, userId);

      expect(updateChain.update).toHaveBeenCalledWith({ messages_count: 4 });
    });

    it('should not let messages_count go below 0', async () => {
      const message = {
        id: messageId,
        user_id: userId,
        nook_id: nookId,
        nook: { creator_id: 'other-user' },
      };
      const nookData = { messages_count: 0 };

      const fetchChain = createMockQueryChain({ data: message, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const nookCountChain = createMockQueryChain({ data: nookData, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(nookCountChain)
        .mockReturnValueOnce(updateChain);

      await service.deleteMessage(nookId, messageId, userId);

      expect(updateChain.update).toHaveBeenCalledWith({ messages_count: 0 });
    });
  });
});
