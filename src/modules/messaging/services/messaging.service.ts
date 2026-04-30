// messaging.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { EmailService } from '../../../common/utils/email/email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import logger from '../../../common/utils/logger.util';
import { SendMessageDto, EditMessageDto } from '../dto/messaging.dto';

@Injectable()
export class MessagingService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
    private emailService: EmailService,
    @Inject(forwardRef(() => NotificationsService))
    private notifications: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async sendMessage(userId: string, dto: SendMessageDto) {
    logger.info('Sending message', {
      userId,
      conversationId: dto.conversation_id,
    });

    try {
      // Verify conversation exists and user is participant
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('id, user1_id, user2_id, is_active, context_type')
        .eq('id', dto.conversation_id)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException(
          'Not authorized to send messages in this conversation',
        );
      }

      if (!conversation.is_active) {
        throw new BadRequestException('Conversation is not active');
      }

      // Verify chat type matches
      if (dto.chat_type !== conversation.context_type) {
        throw new BadRequestException('Chat type mismatch');
      }

      // Create message
      const messageData = {
        conversation_id: dto.conversation_id,
        sender_id: userId,
        content_encrypted: dto.content_encrypted,
        content_type: dto.content_type,
        file_url: dto.file_url,
        file_name: dto.file_name,
        file_size: dto.file_size,
        file_type: dto.file_type,
        is_delivered: false,
        is_read: false,
      };

      const { data: message, error: msgError } = await this.admin
        .from('messages')
        .insert([messageData])
        .select()
        .single();

      if (msgError) throw msgError;

      // Update conversation last activity
      await this.admin
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', dto.conversation_id);

      // Get recipient ID
      const recipientId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      // Get sender info for WebSocket broadcast
      const { data: senderProfile } = await this.admin
        .from('user_profiles')
        .select('username, avatar, is_company_verified')
        .eq('id', userId)
        .single();

      const senderName = await this.identityReveal.resolveNotificationName(
        userId,
        recipientId,
      );

      // Notify recipient of new message
      try {
        await this.notifications.createNotification({
          user_id: recipientId,
          actor_id: userId,
          type: 'message_received',
          title: 'New Message',
          message: `${senderName} sent you a message`,
          action_url: `/messages/${dto.conversation_id}`,
          reference_id: message.id,
          reference_type: 'message',
          metadata: {
            conversation_id: dto.conversation_id,
            chat_type: dto.chat_type,
          },
        });
      } catch (notifError) {
        logger.warn('Failed to send message notification', {
          notifError,
          recipientId,
        });
      }

      // Return complete message data for WebSocket broadcast
      return {
        success: true,
        data: {
          // Message metadata (for backward compatibility)
          message_id: message.id,
          conversation_id: message.conversation_id,
          sent_at: message.created_at,
          recipient_id: recipientId,
          sender_info: senderProfile,
          chat_type: dto.chat_type,

          // Complete message object (for frontend display)
          message: {
            id: message.id,
            conversation_id: message.conversation_id,
            sender_id: userId,
            content_encrypted: message.content_encrypted,
            content_type: message.content_type,
            file_url: message.file_url,
            file_name: message.file_name,
            file_size: message.file_size,
            file_type: message.file_type,
            is_delivered: message.is_delivered,
            is_read: message.is_read,
            created_at: message.created_at,
            read_at: message.read_at,
            sender_info: senderProfile,
          },
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
      logger.error('Failed to send message', { error, userId });
      throw new BadRequestException('Failed to send message');
    }
  }

  async markAsRead(userId: string, messageId: string, conversationId: string) {
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
        throw new ForbiddenException('Not authorized');
      }

      // Mark all unread messages in this conversation (sent by the other user) as read
      const now = new Date().toISOString();
      const { error } = await this.admin
        .from('messages')
        .update({ is_read: true, read_at: now })
        .eq('conversation_id', conversationId)
        .eq('is_read', false)
        .neq('sender_id', userId);

      if (error) throw error;

      // Return remaining unread count for this conversation
      const { count: remainingUnread } = await this.admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('is_read', false)
        .neq('sender_id', userId);

      return {
        success: true,
        data: {
          message_id: messageId,
          conversation_id: conversationId,
          read_at: now,
          unread_count: remainingUnread ?? 0,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      const errObj = error as any;
      const errMsg = errObj?.message || JSON.stringify(error);
      logger.error('Failed to mark message as read', {
        error: errMsg,
        code: errObj?.code,
        hint: errObj?.hint,
        userId,
        messageId,
        conversationId,
      });
      throw new BadRequestException('Failed to mark message as read');
    }
  }

  async getUnreadCount(userId: string, chatType?: string) {
    try {
      // Single RPC call instead of 2 sequential queries
      const { data, error } = await this.admin.rpc('get_unread_message_count', {
        p_user_id: userId,
        p_chat_type: chatType || null,
      });

      if (error) {
        // Fallback to original 2-query approach if RPC doesn't exist
        logger.warn('RPC fallback for unread count', { error: error.message });
        return this.getUnreadCountFallback(userId, chatType);
      }

      // RPC returns { get_unread_message_count: N }
      const count =
        typeof data === 'object' && data !== null
          ? (data.get_unread_message_count ?? 0)
          : (data ?? 0);

      return {
        success: true,
        data: {
          unread_count: count,
          chat_type: chatType || 'all',
        },
      };
    } catch (error) {
      logger.error('Failed to get unread count', { error, userId });
      throw new BadRequestException('Failed to get unread count');
    }
  }

  private async getUnreadCountFallback(userId: string, chatType?: string) {
    const { data: convs } = await this.admin
      .from('conversations')
      .select('id, context_type')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq('is_active', true);

    if (!convs || convs.length === 0) {
      return {
        success: true,
        data: { unread_count: 0, chat_type: chatType || 'all' },
      };
    }

    let ids = convs.map((c: any) => c.id);
    if (chatType && chatType !== 'all') {
      ids = convs
        .filter((c: any) => c.context_type === chatType)
        .map((c: any) => c.id);
    }
    if (ids.length === 0) {
      return {
        success: true,
        data: { unread_count: 0, chat_type: chatType || 'all' },
      };
    }

    const { count } = await this.admin
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('is_read', false)
      .not('sender_id', 'eq', userId)
      .in('conversation_id', ids);

    return {
      success: true,
      data: { unread_count: count || 0, chat_type: chatType || 'all' },
    };
  }

  async deleteMessage(
    userId: string,
    messageId: string,
    conversationId: string,
  ) {
    try {
      logger.info('Deleting message', { userId, messageId, conversationId });

      // Verify conversation exists and user is participant
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('id, user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException(
          'Not authorized to delete messages in this conversation',
        );
      }

      // Verify message exists in this conversation
      const { data: message, error: msgError } = await this.admin
        .from('messages')
        .select('id, conversation_id')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .single();

      if (msgError || !message) {
        throw new NotFoundException('Message not found');
      }

      // Determine if user is user1 or user2 and set the appropriate flag
      const deleteField =
        conversation.user1_id === userId
          ? 'deleted_by_user1'
          : 'deleted_by_user2';

      const { error: updateError } = await this.admin
        .from('messages')
        .update({ [deleteField]: true })
        .eq('id', messageId);

      if (updateError) throw updateError;

      logger.info('Successfully deleted message', {
        messageId,
        conversationId,
        userId,
        deleteField,
      });

      return {
        success: true,
        data: {
          message_id: messageId,
          conversation_id: conversationId,
          deleted_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      logger.error('Failed to delete message', { error, userId, messageId });
      throw new BadRequestException('Failed to delete message');
    }
  }

  async editMessage(userId: string, messageId: string, dto: EditMessageDto) {
    try {
      logger.info('Editing message', {
        userId,
        messageId,
        conversationId: dto.conversation_id,
      });

      // Verify conversation exists and user is participant and conversation is active
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('id, user1_id, user2_id, is_active')
        .eq('id', dto.conversation_id)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException(
          'Not authorized to edit messages in this conversation',
        );
      }

      if (!conversation.is_active) {
        throw new BadRequestException('Conversation is not active');
      }

      // Verify message exists and belongs to this conversation
      const { data: message, error: msgError } = await this.admin
        .from('messages')
        .select('id, conversation_id, sender_id, content_type')
        .eq('id', messageId)
        .eq('conversation_id', dto.conversation_id)
        .single();

      if (msgError || !message) {
        throw new NotFoundException('Message not found');
      }

      // Only the sender can edit their own message
      if (message.sender_id !== userId) {
        throw new ForbiddenException('You can only edit your own messages');
      }

      // Only allow editing text messages
      if (message.content_type !== 'text') {
        throw new BadRequestException('Only text messages can be edited');
      }

      // Update the message
      const now = new Date().toISOString();
      const { data: updatedMessage, error: updateError } = await this.admin
        .from('messages')
        .update({
          content_encrypted: dto.content_encrypted,
          is_edited: true,
          edited_at: now,
          updated_at: now,
        })
        .eq('id', messageId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Get recipient ID
      const recipientId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      logger.info('Successfully edited message', {
        messageId,
        conversationId: dto.conversation_id,
        userId,
      });

      return {
        success: true,
        data: {
          message_id: updatedMessage.id,
          conversation_id: updatedMessage.conversation_id,
          content_encrypted: updatedMessage.content_encrypted,
          is_edited: updatedMessage.is_edited,
          edited_at: updatedMessage.edited_at,
          updated_at: updatedMessage.updated_at,
          recipient_id: recipientId,
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
      logger.error('Failed to edit message', { error, userId, messageId });
      throw new BadRequestException('Failed to edit message');
    }
  }

  // NEW: Set typing status
  async setTypingStatus(
    userId: string,
    conversationId: string,
    isTyping: boolean,
  ) {
    logger.info('Setting typing status', {
      userId,
      conversationId,
      isTyping,
    });

    try {
      // Verify conversation exists and user is participant
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('id, user1_id, user2_id, is_active')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this conversation');
      }

      if (!conversation.is_active) {
        throw new BadRequestException('Conversation is not active');
      }

      // Get recipient ID
      const recipientId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      // Get user info for typing notification
      const { data: userProfile } = await this.admin
        .from('user_profiles')
        .select('id, username, avatar, is_company_verified')
        .eq('id', userId)
        .single();

      return {
        success: true,
        data: {
          user_id: userId,
          conversation_id: conversationId,
          is_typing: isTyping,
          recipient_id: recipientId,
          user_info: userProfile,
          timestamp: new Date().toISOString(),
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
      logger.error('Failed to set typing status', { error, userId });
      throw new BadRequestException('Failed to set typing status');
    }
  }

  // NEW: Get typing status
  async getTypingStatus(userId: string, conversationId: string) {
    try {
      // Verify conversation access
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('id, user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this conversation');
      }

      // In a real implementation, this would fetch from Redis or similar
      // For now, return empty (WebSocket handles real-time typing)

      return {
        success: true,
        data: {
          conversation_id: conversationId,
          active_typers: [],
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      logger.error('Failed to get typing status', { error, userId });
      throw new BadRequestException('Failed to get typing status');
    }
  }
}
