import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import {
  CreateConversationDto,
  GetConversationsDto,
  ClearConversationDto,
} from '../dto/conversations.dto';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class ConversationsService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async createConversation(userId: string, dto: CreateConversationDto) {
    logger.info('Creating conversation', {
      userId,
      otherUserId: dto.other_user_id,
    });

    try {
      // Check if user exists
      const { data: otherUser, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar')
        .eq('id', dto.other_user_id)
        .single();

      if (userError || !otherUser) {
        throw new NotFoundException('User not found');
      }

      // Check if conversation already exists
      const { data: existingConv } = await this.admin
        .from('conversations')
        .select('id, context_type, context_id')
        .or(
          `and(user1_id.eq.${userId},user2_id.eq.${dto.other_user_id}),and(user1_id.eq.${dto.other_user_id},user2_id.eq.${userId})`,
        )
        .eq('context_type', dto.context_type)
        .eq('context_id', dto.context_id || null)
        .maybeSingle();

      if (existingConv) {
        return {
          success: true,
          data: {
            conversation_id: existingConv.id,
            already_exists: true,
          },
        };
      }

      // Create conversation
      const conversationData = {
        user1_id: userId,
        user2_id: dto.other_user_id,
        context_type: dto.context_type,
        context_id: dto.context_id,
        is_active: true,
        last_message_at: new Date().toISOString(),
      };

      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .insert([conversationData])
        .select()
        .single();

      if (convError) throw convError;

      // Send initial message if provided
      if (dto.initial_message) {
        const messageData = {
          conversation_id: conversation.id,
          sender_id: userId,
          content_encrypted: this.encryption.encrypt(dto.initial_message),
          content_type: 'text',
          is_delivered: false,
          is_read: false,
        };

        await this.admin.from('messages').insert([messageData]);
      }

      return {
        success: true,
        data: {
          conversation_id: conversation.id,
          other_user: {
            id: otherUser.id,
            username: otherUser.username,
            avatar: otherUser.avatar,
          },
          chat_type: dto.context_type,
          context_id: dto.context_id,
          created_at: conversation.created_at,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to create conversation', { error, userId });
      throw new BadRequestException('Failed to create conversation');
    }
  }

  async getConversations(userId: string, dto: GetConversationsDto) {
    try {
      // Ensure defaults are applied
      const chatType = dto.chat_type || 'all';
      const limit = dto.limit || 20;
      const offset = dto.offset || 0;
      const search = dto.search || '';

      // Base query for user's conversations
      let query = this.admin
        .from('conversations')
        .select(
          `
          id,
          user1_id,
          user2_id,
          context_type,
          context_id,
          is_active,
          last_message_at,
          updated_at,
          user1_cleared_at,
          user2_cleared_at,
          user1_identity_revealed,
          user2_identity_revealed
        `,
        )
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply chat type filter
      if (chatType !== 'all') {
        query = query.eq('context_type', chatType);
      }

      const { data: conversations, error } = await query;

      if (error) throw error;

      // Get last messages and unread counts
      const enhancedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const otherUserId =
            conv.user1_id === userId ? conv.user2_id : conv.user1_id;

          // Get other user info
          const { data: otherUser } = await this.admin
            .from('user_profiles')
            .select('username, avatar, job_title, company, mentoring_as')
            .eq('id', otherUserId)
            .single();

          // Get last message
          const { data: lastMessage } = await this.admin
            .from('messages')
            .select('content_encrypted, content_type, created_at, sender_id')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Get unread count
          const { count: unreadCount } = await this.admin
            .from('messages')
            .select('id', { count: 'exact' })
            .eq('conversation_id', conv.id)
            .eq('is_read', false)
            .not('sender_id', 'eq', userId);

          // Get mentorship context if applicable
          let mentorshipContext = null;
          if (conv.context_type === 'mentorship' && conv.context_id) {
            const { data: relationship } = await this.admin
              .from('mentorship_relationships')
              .select('status, mentor_id, mentee_id')
              .eq('id', conv.context_id)
              .single();

            if (relationship) {
              mentorshipContext = {
                relationship_id: conv.context_id,
                role: relationship.mentor_id === userId ? 'mentor' : 'mentee',
                status: relationship.status,
              };
            }
          }

          // Check identity reveal status
          const identityRevealed =
            conv.user1_id === userId
              ? conv.user1_identity_revealed
              : conv.user2_identity_revealed;

          return {
            id: conv.id,
            other_user: {
              id: otherUserId,
              username: otherUser?.username || 'Anonymous',
              avatar: otherUser?.avatar || '👤',
              job_title: otherUser?.job_title,
              company: otherUser?.company,
              mentoring_as: otherUser?.mentoring_as,
            },
            last_message: lastMessage
              ? {
                  content_preview: lastMessage.content_encrypted
                    ? this.encryption
                        .decrypt(lastMessage.content_encrypted)
                        .substring(0, 100)
                    : '',
                  sender_id: lastMessage.sender_id,
                  sent_at: lastMessage.created_at,
                  content_type: lastMessage.content_type,
                }
              : null,
            unread_count: unreadCount || 0,
            chat_type: conv.context_type,
            mentorship_context: mentorshipContext,
            identity_revealed: identityRevealed,
            updated_at: conv.updated_at,
            last_activity_at: conv.last_message_at,
          };
        }),
      );

      // Filter by search term if provided
      let filteredConversations = enhancedConversations;
      if (search) {
        filteredConversations = enhancedConversations.filter(
          (conv) =>
            conv.other_user.username
              .toLowerCase()
              .includes(search.toLowerCase()) ||
            conv.last_message?.content_preview
              ?.toLowerCase()
              .includes(search.toLowerCase()),
        );
      }

      // Get total count for pagination
      let countQuery = this.admin
        .from('conversations')
        .select('id', { count: 'exact' })
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('is_active', true);

      if (chatType !== 'all') {
        countQuery = countQuery.eq('context_type', chatType);
      }

      const { count: totalCount } = await countQuery;

      return {
        success: true,
        data: {
          conversations: filteredConversations,
          total: totalCount || 0,
          page: Math.floor(offset / limit) + 1,
          limit: limit,
          total_pages: Math.ceil((totalCount || 0) / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get conversations', { error, userId });
      throw new BadRequestException('Failed to get conversations');
    }
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
    limit: number = 50,
    before?: string,
  ) {
    try {
      // Verify conversation access
      const { data: conversation } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (
        !conversation ||
        (conversation.user1_id !== userId && conversation.user2_id !== userId)
      ) {
        throw new ForbiddenException(
          'Not authorized to view this conversation',
        );
      }

      // Build messages query
      let query = this.admin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        // Get timestamp of the 'before' message
        const { data: beforeMessage } = await this.admin
          .from('messages')
          .select('created_at')
          .eq('id', before)
          .single();

        if (beforeMessage) {
          query = query.lt('created_at', beforeMessage.created_at);
        }
      }

      const { data: messages, error } = await query;

      if (error) throw error;

      // Get sender info for each message
      const enhancedMessages = await Promise.all(
        messages.map(async (msg) => {
          const { data: sender } = await this.admin
            .from('user_profiles')
            .select('username, avatar')
            .eq('id', msg.sender_id)
            .single();

          return {
            id: msg.id,
            sender_id: msg.sender_id,
            content_encrypted: msg.content_encrypted,
            content_type: msg.content_type,
            file_url: msg.file_url,
            file_name: msg.file_name,
            file_size: msg.file_size,
            file_type: msg.file_type,
            is_read: msg.is_read,
            read_at: msg.read_at,
            is_delivered: msg.is_delivered,
            sent_at: msg.created_at,
            sender_info: {
              username: sender?.username || 'Anonymous',
              avatar: sender?.avatar || '👤',
            },
          };
        }),
      );

      // Mark messages as delivered if they were sent to this user
      const undeliveredMessages = messages.filter(
        (msg) => !msg.is_delivered && msg.sender_id !== userId,
      );

      if (undeliveredMessages.length > 0) {
        await this.admin
          .from('messages')
          .update({ is_delivered: true })
          .in(
            'id',
            undeliveredMessages.map((msg) => msg.id),
          );
      }

      // Check if there are more messages
      const { count: totalCount } = await this.admin
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('conversation_id', conversationId);

      const hasMore = (totalCount || 0) > messages.length;

      return {
        success: true,
        data: {
          conversation_id: conversationId,
          messages: enhancedMessages.reverse(), // Reverse to show oldest first
          has_more: hasMore,
          total_count: totalCount || 0,
        },
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      logger.error('Failed to get messages', { error, userId });
      throw new BadRequestException('Failed to get messages');
    }
  }

  async clearConversation(userId: string, dto: ClearConversationDto) {
    try {
      const { data: conversation } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('id', dto.conversation_id)
        .single();

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException('Not authorized');
      }

      // Mark as cleared for this user
      const updateField =
        conversation.user1_id === userId
          ? 'user1_cleared_at'
          : 'user2_cleared_at';

      const { error } = await this.admin
        .from('conversations')
        .update({ [updateField]: new Date().toISOString() })
        .eq('id', dto.conversation_id);

      if (error) throw error;

      return {
        success: true,
        data: {
          conversation_id: dto.conversation_id,
          cleared_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      logger.error('Failed to clear conversation', { error, userId });
      throw new BadRequestException('Failed to clear conversation');
    }
  }
}
