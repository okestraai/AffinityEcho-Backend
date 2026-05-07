import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
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
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ConversationsService', () => {
  let service: ConversationsService;
  let mockClient: any;
  let mockConfigService: any;
  let mockEncryption: any;
  let mockIdentityReveal: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockConfigService = createMockConfigService();
    mockEncryption = {
      encrypt: jest.fn((text: string) => 'encrypted_' + text),
      decrypt: jest.fn((text: string) => 'decrypted_' + text),
    };
    mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue(new Set()),
      decryptRealName: jest.fn().mockReturnValue(null),
      isRevealed: jest.fn().mockResolvedValue(false),
    };

    service = new ConversationsService(
      mockConfigService,
      mockEncryption,
      mockIdentityReveal,
    );
  });

  describe('getConversations', () => {
    const userId = 'user-001';

    it('should return user conversations with last messages', async () => {
      const conversations = [
        {
          id: 'conv-001',
          user1_id: userId,
          user2_id: 'user-002',
          context_type: 'regular',
          context_id: null,
          is_active: true,
          last_message_at: '2025-01-15T10:00:00Z',
          updated_at: '2025-01-15T10:00:00Z',
          user1_cleared_at: null,
          user2_cleared_at: null,
          user1_identity_revealed: false,
          user2_identity_revealed: false,
        },
        {
          id: 'conv-002',
          user1_id: 'user-003',
          user2_id: userId,
          context_type: 'regular',
          context_id: null,
          is_active: true,
          last_message_at: '2025-01-14T10:00:00Z',
          updated_at: '2025-01-14T10:00:00Z',
          user1_cleared_at: null,
          user2_cleared_at: null,
          user1_identity_revealed: false,
          user2_identity_revealed: false,
        },
      ];

      const otherUsers = [
        {
          id: 'user-002',
          username: 'alice',
          avatar: 'avatar1',
          job_title: 'Engineer',
          company_encrypted: 'enc_company1',
          mentoring_as: null,
          first_name_encrypted: null,
          last_name_encrypted: null,
        },
        {
          id: 'user-003',
          username: 'bob',
          avatar: 'avatar2',
          job_title: 'Designer',
          company_encrypted: null,
          mentoring_as: null,
          first_name_encrypted: null,
          last_name_encrypted: null,
        },
      ];

      const lastMessages = [
        {
          conversation_id: 'conv-001',
          content_encrypted: 'encrypted_hello',
          content_type: 'text',
          created_at: '2025-01-15T10:00:00Z',
          sender_id: 'user-002',
        },
        {
          conversation_id: 'conv-002',
          content_encrypted: 'encrypted_world',
          content_type: 'text',
          created_at: '2025-01-14T10:00:00Z',
          sender_id: 'user-003',
        },
      ];

      const unreadMessages = [
        { conversation_id: 'conv-001' },
        { conversation_id: 'conv-001' },
      ];

      // Chain setup:
      // 1. conversations query
      const convsChain = createMockQueryChain({
        data: conversations,
        error: null,
      });
      // 2. user_profiles batch fetch
      const usersChain = createMockQueryChain({
        data: otherUsers,
        error: null,
      });
      // 3. lastMessages query
      const lastMsgChain = createMockQueryChain({
        data: lastMessages,
        error: null,
      });
      // 4. unread messages query (per-conversation counting)
      const unreadMsgChain = createMockQueryChain({
        data: unreadMessages,
        error: null,
      });
      // 5. count query for pagination
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 2,
      });

      // user_blocks check (no blocks)
      const blocksChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(convsChain) // conversations
        .mockReturnValueOnce(blocksChain) // user_blocks
        .mockReturnValueOnce(usersChain) // user_profiles
        .mockReturnValueOnce(lastMsgChain) // messages (last messages)
        .mockReturnValueOnce(unreadMsgChain) // messages (unread per-conv)
        .mockReturnValueOnce(countChain); // conversations (count)

      const result = await service.getConversations(userId, {
        chat_type: 'all',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data.conversations).toHaveLength(2);
      expect(result.data.total).toBe(2);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);

      // Verify first conversation has correct other_user
      expect(result.data.conversations[0].other_user.id).toBe('user-002');
      expect(result.data.conversations[0].other_user.username).toBe('alice');

      // Verify second conversation has correct other_user
      expect(result.data.conversations[1].other_user.id).toBe('user-003');
      expect(result.data.conversations[1].other_user.username).toBe('bob');

      // Verify company was decrypted for user with company_encrypted
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc_company1');
    });

    it('should return empty array when no conversations', async () => {
      const convsChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(convsChain);

      const result = await service.getConversations(userId, {
        chat_type: 'all',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data.conversations).toEqual([]);
      expect(result.data.total).toBe(0);
      expect(result.data.total_pages).toBe(0);
    });

    it('should return empty array when conversations is null', async () => {
      const convsChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(convsChain);

      const result = await service.getConversations(userId, {
        chat_type: 'all',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data.conversations).toEqual([]);
      expect(result.data.total).toBe(0);
    });

    it('should throw BadRequestException on supabase query error', async () => {
      const convsChain = createMockQueryChain({
        data: null,
        error: {
          message: 'query error',
          details: null,
          hint: null,
          code: '500',
        },
      });
      mockClient.from.mockReturnValueOnce(convsChain);

      await expect(
        service.getConversations(userId, {
          chat_type: 'all',
          limit: 20,
          offset: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include mentorship context for mentorship conversations', async () => {
      const conversations = [
        {
          id: 'conv-001',
          user1_id: userId,
          user2_id: 'user-002',
          context_type: 'mentorship',
          context_id: 'mentorship-001',
          is_active: true,
          last_message_at: '2025-01-15T10:00:00Z',
          updated_at: '2025-01-15T10:00:00Z',
          user1_cleared_at: null,
          user2_cleared_at: null,
          user1_identity_revealed: false,
          user2_identity_revealed: false,
        },
      ];

      const otherUsers = [
        {
          id: 'user-002',
          username: 'mentor_alice',
          avatar: 'avatar1',
          job_title: 'Senior Engineer',
          company_encrypted: null,
          mentoring_as: 'career',
          first_name_encrypted: null,
          last_name_encrypted: null,
        },
      ];

      const mentorshipRelationships = [
        {
          id: 'mentorship-001',
          status: 'active',
          mentor_id: 'user-002',
          mentee_id: userId,
        },
      ];

      const convsChain = createMockQueryChain({
        data: conversations,
        error: null,
      });
      const usersChain = createMockQueryChain({
        data: otherUsers,
        error: null,
      });
      const lastMsgChain = createMockQueryChain({ data: [], error: null });
      const unreadMsgChain = createMockQueryChain({ data: [], error: null });
      const mentorshipChain = createMockQueryChain({
        data: mentorshipRelationships,
        error: null,
      });
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 1,
      });

      const blocksChain2 = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(convsChain)
        .mockReturnValueOnce(blocksChain2)
        .mockReturnValueOnce(usersChain)
        .mockReturnValueOnce(lastMsgChain)
        .mockReturnValueOnce(unreadMsgChain)
        .mockReturnValueOnce(mentorshipChain)
        .mockReturnValueOnce(countChain);

      const result = await service.getConversations(userId, {
        chat_type: 'all',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data.conversations[0].mentorship_context).toEqual({
        relationship_id: 'mentorship-001',
        role: 'mentee',
        status: 'active',
      });
    });

    it('should use default values when dto has no fields set', async () => {
      const convsChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(convsChain);

      const result = await service.getConversations(userId, {} as any);

      expect(result.success).toBe(true);
      expect(result.data.conversations).toEqual([]);
      expect(result.data.limit).toBe(20);
      expect(result.data.page).toBe(1);
    });
  });

  describe('createConversation', () => {
    const userId = 'user-001';
    const otherUserId = 'user-002';

    it('should create a new conversation', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'everyone',
      };

      const createdConversation = {
        id: 'conv-new',
        user1_id: userId,
        user2_id: otherUserId,
        context_type: 'regular',
        context_id: null,
        is_active: true,
        created_at: '2025-01-15T10:00:00Z',
      };

      // 1. user_profiles check
      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      // 2. user_blocks check
      const blockCheckChain = createMockQueryChain({ data: null, error: null });
      // 3. existing conversation check
      const existingConvChain = createMockQueryChain({
        data: null,
        error: null,
      });
      // 4. insert conversation
      const insertChain = createMockQueryChain({
        data: createdConversation,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain)
        .mockReturnValueOnce(existingConvChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createConversation(userId, {
        other_user_id: otherUserId,
        context_type: 'regular',
      });

      expect(result.success).toBe(true);
      expect(result.data.conversation_id).toBe('conv-new');
      expect(result.data.other_user.id).toBe(otherUserId);
      expect(result.data.other_user.username).toBe('alice');
    });

    it('should return existing conversation if one already exists', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'everyone',
      };

      const existingConversation = {
        id: 'conv-existing',
        context_type: 'regular',
        context_id: null,
      };

      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      const blockCheckChain = createMockQueryChain({ data: null, error: null });
      const existingConvChain = createMockQueryChain({
        data: existingConversation,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain)
        .mockReturnValueOnce(existingConvChain);

      const result = await service.createConversation(userId, {
        other_user_id: otherUserId,
        context_type: 'regular',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('You already have a conversation with this user');
      expect(result.data.conversation_id).toBe('conv-existing');
      expect(result.data.already_exists).toBe(true);
    });

    it('should send initial message when provided', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'everyone',
      };

      const createdConversation = {
        id: 'conv-new',
        user1_id: userId,
        user2_id: otherUserId,
        context_type: 'regular',
        context_id: null,
        is_active: true,
        created_at: '2025-01-15T10:00:00Z',
      };

      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      const blockCheckChain = createMockQueryChain({ data: null, error: null });
      const existingConvChain = createMockQueryChain({
        data: null,
        error: null,
      });
      const insertConvChain = createMockQueryChain({
        data: createdConversation,
        error: null,
      });
      const insertMsgChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain)
        .mockReturnValueOnce(existingConvChain)
        .mockReturnValueOnce(insertConvChain)
        .mockReturnValueOnce(insertMsgChain);

      await service.createConversation(userId, {
        other_user_id: otherUserId,
        context_type: 'regular',
        initial_message: 'Hello Alice!',
      });

      // Verify encryption was called for the initial message
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('Hello Alice!');
      // Verify insert was called on messages table
      expect(mockClient.from).toHaveBeenCalledWith('messages');
    });

    it('should throw BadRequestException for self-conversation', async () => {
      await expect(
        service.createConversation(userId, {
          other_user_id: userId,
          context_type: 'regular',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when other user not found', async () => {
      const userCheckChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(userCheckChain);

      await expect(
        service.createConversation(userId, {
          other_user_id: otherUserId,
          context_type: 'regular',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when users are blocked', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'everyone',
      };
      const block = { id: 'block-001' };

      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      const blockCheckChain = createMockQueryChain({
        data: block,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain);

      await expect(
        service.createConversation(userId, {
          other_user_id: otherUserId,
          context_type: 'regular',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when other user does not accept messages (no_one)', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'no_one',
      };

      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      const blockCheckChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain);

      await expect(
        service.createConversation(userId, {
          other_user_id: otherUserId,
          context_type: 'regular',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when connections-only and not connected', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'connections',
      };

      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      const blockCheckChain = createMockQueryChain({ data: null, error: null });
      const followCheckChain = createMockQueryChain({
        data: null,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain)
        .mockReturnValueOnce(followCheckChain);

      await expect(
        service.createConversation(userId, {
          other_user_id: otherUserId,
          context_type: 'regular',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow connections-only when users are connected', async () => {
      const otherUser = {
        id: otherUserId,
        username: 'alice',
        avatar: 'avatar1',
        allow_messages_from: 'connections',
      };
      const followRecord = { id: 'follow-001' };
      const createdConversation = {
        id: 'conv-new',
        user1_id: userId,
        user2_id: otherUserId,
        context_type: 'regular',
        context_id: null,
        is_active: true,
        created_at: '2025-01-15T10:00:00Z',
      };

      const userCheckChain = createMockQueryChain({
        data: otherUser,
        error: null,
      });
      const blockCheckChain = createMockQueryChain({ data: null, error: null });
      const followCheckChain = createMockQueryChain({
        data: followRecord,
        error: null,
      });
      const existingConvChain = createMockQueryChain({
        data: null,
        error: null,
      });
      const insertChain = createMockQueryChain({
        data: createdConversation,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(userCheckChain)
        .mockReturnValueOnce(blockCheckChain)
        .mockReturnValueOnce(followCheckChain)
        .mockReturnValueOnce(existingConvChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createConversation(userId, {
        other_user_id: otherUserId,
        context_type: 'regular',
      });

      expect(result.success).toBe(true);
      expect(result.data.conversation_id).toBe('conv-new');
    });
  });

  describe('getConversationMessages', () => {
    const userId = 'user-001';
    const conversationId = 'conv-001';

    it('should return conversation with messages', async () => {
      const conversation = {
        user1_id: userId,
        user2_id: 'user-002',
        user1_identity_revealed: false,
        user2_identity_revealed: false,
      };

      const messages = [
        {
          id: 'msg-001',
          sender_id: userId,
          content_encrypted: 'encrypted_hello',
          content_type: 'text',
          file_url: null,
          file_name: null,
          file_size: null,
          file_type: null,
          is_read: true,
          read_at: '2025-01-15T10:01:00Z',
          is_delivered: true,
          created_at: '2025-01-15T10:00:00Z',
        },
        {
          id: 'msg-002',
          sender_id: 'user-002',
          content_encrypted: 'encrypted_hi_there',
          content_type: 'text',
          file_url: null,
          file_name: null,
          file_size: null,
          file_type: null,
          is_read: false,
          read_at: null,
          is_delivered: false,
          created_at: '2025-01-15T10:05:00Z',
        },
      ];

      const senderProfiles = [
        {
          id: userId,
          username: 'me',
          avatar: 'avatar-me',
          first_name_encrypted: null,
          last_name_encrypted: null,
        },
        {
          id: 'user-002',
          username: 'alice',
          avatar: 'avatar1',
          first_name_encrypted: null,
          last_name_encrypted: null,
        },
      ];

      // 1. conversation check
      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      // 2. messages query
      const msgsChain = createMockQueryChain({ data: messages, error: null });
      // 3. sender profiles
      const profilesChain = createMockQueryChain({
        data: senderProfiles,
        error: null,
      });
      // 4. mark as delivered (update)
      const deliveredChain = createMockQueryChain({ data: null, error: null });
      // 5. total count
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 2,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(deliveredChain)
        .mockReturnValueOnce(countChain);

      const result = await service.getConversationMessages(
        userId,
        conversationId,
      );

      expect(result.success).toBe(true);
      expect(result.data.conversation_id).toBe(conversationId);
      expect(result.data.messages).toHaveLength(2);
      expect(result.data.has_more).toBe(false);
      expect(result.data.total_count).toBe(2);

      // Messages should be reversed (oldest first)
      expect(result.data.messages[0].id).toBe('msg-002');
      expect(result.data.messages[1].id).toBe('msg-001');

      // Verify sender info is attached
      expect(result.data.messages[1].sender_info.username).toBe('me');
      expect(result.data.messages[0].sender_info.username).toBe('alice');
    });

    it('should throw NotFoundException when conversation not found', async () => {
      const convChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(convChain);

      await expect(
        service.getConversationMessages(userId, conversationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      const conversation = {
        user1_id: 'other-user-1',
        user2_id: 'other-user-2',
        user1_identity_revealed: false,
        user2_identity_revealed: false,
      };

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(convChain);

      await expect(
        service.getConversationMessages(userId, conversationId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reveal real names when identity is revealed', async () => {
      const conversation = {
        user1_id: userId,
        user2_id: 'user-002',
        user1_identity_revealed: true,
        user2_identity_revealed: true,
      };

      const messages = [
        {
          id: 'msg-001',
          sender_id: 'user-002',
          content_encrypted: 'encrypted_hello',
          content_type: 'text',
          file_url: null,
          file_name: null,
          file_size: null,
          file_type: null,
          is_read: true,
          read_at: null,
          is_delivered: true,
          created_at: '2025-01-15T10:00:00Z',
        },
      ];

      const senderProfiles = [
        {
          id: 'user-002',
          username: 'alice',
          avatar: 'avatar1',
          first_name_encrypted: 'enc_Alice',
          last_name_encrypted: 'enc_Smith',
        },
      ];

      mockIdentityReveal.decryptRealName.mockReturnValue('Alice Smith');

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      const msgsChain = createMockQueryChain({ data: messages, error: null });
      const profilesChain = createMockQueryChain({
        data: senderProfiles,
        error: null,
      });
      // No undelivered messages to mark
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 1,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(countChain);

      const result = await service.getConversationMessages(
        userId,
        conversationId,
      );

      expect(mockIdentityReveal.decryptRealName).toHaveBeenCalledWith(
        'enc_Alice',
        'enc_Smith',
      );
      expect(result.data.messages[0].sender_info.display_name).toBe(
        'Alice Smith',
      );
    });

    it('should mark undelivered messages as delivered', async () => {
      const conversation = {
        user1_id: userId,
        user2_id: 'user-002',
        user1_identity_revealed: false,
        user2_identity_revealed: false,
      };

      const messages = [
        {
          id: 'msg-undelivered',
          sender_id: 'user-002',
          content_encrypted: 'encrypted_hi',
          content_type: 'text',
          file_url: null,
          file_name: null,
          file_size: null,
          file_type: null,
          is_read: false,
          read_at: null,
          is_delivered: false,
          created_at: '2025-01-15T10:00:00Z',
        },
      ];

      const senderProfiles = [
        {
          id: 'user-002',
          username: 'alice',
          avatar: 'avatar1',
          first_name_encrypted: null,
          last_name_encrypted: null,
        },
      ];

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      const msgsChain = createMockQueryChain({ data: messages, error: null });
      const profilesChain = createMockQueryChain({
        data: senderProfiles,
        error: null,
      });
      const deliveredChain = createMockQueryChain({ data: null, error: null });
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 1,
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgsChain)
        .mockReturnValueOnce(profilesChain)
        .mockReturnValueOnce(deliveredChain)
        .mockReturnValueOnce(countChain);

      await service.getConversationMessages(userId, conversationId);

      // Verify update was called with is_delivered: true
      expect(deliveredChain.update).toHaveBeenCalledWith({
        is_delivered: true,
      });
      expect(mockClient.from).toHaveBeenCalledWith('messages');
    });
  });

  describe('clearConversation', () => {
    const userId = 'user-001';

    it('should clear conversation for user1', async () => {
      const conversation = {
        user1_id: userId,
        user2_id: 'user-002',
      };

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.clearConversation(userId, {
        conversation_id: 'conv-001',
      });

      expect(result.success).toBe(true);
      expect(result.data.conversation_id).toBe('conv-001');
      expect(result.data.cleared_at).toBeDefined();

      // Should update user1_cleared_at since userId is user1
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ user1_cleared_at: expect.any(String) }),
      );
    });

    it('should clear conversation for user2', async () => {
      const conversation = {
        user1_id: 'other-user',
        user2_id: userId,
      };

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.clearConversation(userId, {
        conversation_id: 'conv-001',
      });

      expect(result.success).toBe(true);

      // Should update user2_cleared_at since userId is user2
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ user2_cleared_at: expect.any(String) }),
      );
    });

    it('should throw NotFoundException when conversation not found', async () => {
      const convChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(convChain);

      await expect(
        service.clearConversation(userId, {
          conversation_id: 'conv-nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      const conversation = {
        user1_id: 'other-user-1',
        user2_id: 'other-user-2',
      };

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(convChain);

      await expect(
        service.clearConversation(userId, { conversation_id: 'conv-001' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when update fails with non-HTTP error', async () => {
      const conversation = {
        user1_id: userId,
        user2_id: 'user-002',
      };

      const convChain = createMockQueryChain({
        data: conversation,
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'update failed' },
      });

      mockClient.from
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.clearConversation(userId, { conversation_id: 'conv-001' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
