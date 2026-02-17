import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateMessageDto } from '../dto/create-message.dto';
import { MessageQueryDto } from '../dto/message-query.dto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';

@Injectable()
export class NookMessagesService {
  private admin;

  constructor(
    private config: ConfigService,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async getMessages(nookId: string, query: MessageQueryDto, userId: string) {
    const { page = 1, limit = 20, sortOrder = 'asc' } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Check nook exists (select only needed fields instead of *)
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('id, is_active, is_locked, expires_at')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    // Get messages
    const messageSelect = `
      id, nook_id, user_id, parent_message_id, content, is_anonymous,
      is_removed, removed_reason, is_flagged, flagged_count,
      heard_count, validated_count, helpful_count,
      created_at, updated_at,
      user:user_id (
        id,
        username,
        avatar,
        first_name_encrypted,
        last_name_encrypted
      )
    `;

    const {
      data: messages,
      error,
      count,
    } = await this.admin
      .from('nook_messages')
      .select(messageSelect, { count: 'exact' })
      .eq('nook_id', nookId)
      .is('parent_message_id', null)
      .order('created_at', { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) throw new BadRequestException(error.message);

    // Batch-fetch ALL replies for these messages in a single query (instead of N queries)
    const messageIds = (messages || []).map((m) => m.id);
    let repliesMap = new Map<string, any[]>();

    if (messageIds.length > 0) {
      const { data: allReplies } = await this.admin
        .from('nook_messages')
        .select(messageSelect)
        .in('parent_message_id', messageIds)
        .order('created_at', { ascending: true });

      // Group replies by parent_message_id
      (allReplies || []).forEach((reply: any) => {
        const parentId = reply.parent_message_id;
        if (!repliesMap.has(parentId)) {
          repliesMap.set(parentId, []);
        }
        repliesMap.get(parentId)!.push(reply);
      });
    }

    const messagesWithReplies = (messages || []).map((message) => ({
      ...message,
      replies: repliesMap.get(message.id) || [],
    }));

    // Collect all unique user IDs from messages and replies (including self)
    const allUserIds: string[] = [];
    messagesWithReplies.forEach((msg: any) => {
      if (msg.user?.id) allUserIds.push(msg.user.id);
      (msg.replies || []).forEach((reply: any) => {
        if (reply.user?.id) allUserIds.push(reply.user.id);
      });
    });

    // Get revealed user IDs in a single query
    const revealedIds = await this.identityReveal.getRevealedUserIds(userId, allUserIds);

    // Apply identity reveal to messages and replies
    const processedMessages = messagesWithReplies.map((message: any) => {
      const msgUser = message.user;
      const msgDisplayName = this.resolveDisplayName(msgUser, revealedIds, userId);

      return {
        ...message,
        user: {
          id: msgUser?.id,
          avatar: msgUser?.avatar || 'User',
          username: msgUser?.username || 'User',
          display_name: msgDisplayName,
        },
        replies: (message.replies || []).map((reply: any) => {
          const replyUser = reply.user;
          const replyDisplayName = this.resolveDisplayName(replyUser, revealedIds, userId);

          return {
            ...reply,
            user: {
              id: replyUser?.id,
              avatar: replyUser?.avatar || 'User',
              username: replyUser?.username || 'User',
              display_name: replyDisplayName,
            },
          };
        }),
      };
    });

    return {
      success: true,
      data: {
        messages: processedMessages,
        pagination: {
          page,
          limit,
          total: count || 0,
        },
      },
    };
  }

  async createMessage(
    nookId: string,
    createMessageDto: CreateMessageDto,
    userId: string,
  ) {
    const {
      content,
      parent_message_id,
      is_anonymous = true,
    } = createMessageDto;

    // Check nook exists and is active (select only needed fields)
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('id, is_active, is_locked, expires_at, messages_count')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    if (!nook.is_active || nook.is_locked) {
      throw new BadRequestException('Nook is not active or is locked');
    }

    if (new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException('Nook has expired');
    }

    // Check if user is a member
    // Validate parent message if replying
    if (parent_message_id) {
      const { data: parentMessage } = await this.admin
        .from('nook_messages')
        .select('id')
        .eq('id', parent_message_id)
        .eq('nook_id', nookId)
        .maybeSingle();

      if (!parentMessage) {
        throw new BadRequestException('Parent message not found');
      }
    }

    // Create message
    const { data: message, error: createError } = await this.admin
      .from('nook_messages')
      .insert([
        {
          nook_id: nookId,
          user_id: userId,
          parent_message_id: parent_message_id || null,
          content,
          is_anonymous,
        },
      ])
      .select(
        `
        id,
        nook_id,
        user_id,
        content,
        is_anonymous,
        created_at
      `,
      )
      .single();

    if (createError) throw new BadRequestException(createError.message);

    // Update nook stats and temperature in parallel (instead of sequentially)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { count: recentMessages } = await this.admin
      .from('nook_messages')
      .select('*', { count: 'exact', head: true })
      .eq('nook_id', nookId)
      .gte('created_at', oneHourAgo.toISOString());

    let temperature = 'cool';
    if ((recentMessages || 0) >= 10) {
      temperature = 'hot';
    } else if ((recentMessages || 0) >= 3) {
      temperature = 'warm';
    }

    await this.admin
      .from('nooks')
      .update({
        messages_count: (nook.messages_count || 0) + 1,
        last_activity_at: new Date().toISOString(),
        temperature,
      })
      .eq('id', nookId);

    return {
      success: true,
      data: { message },
      message: 'Message posted successfully',
    };
  }

  async deleteMessage(nookId: string, messageId: string, userId: string) {
    // Get message with nook info
    const { data: message, error: fetchError } = await this.admin
      .from('nook_messages')
      .select(
        `
        *,
        nook:nook_id (
          creator_id
        )
      `,
      )
      .eq('id', messageId)
      .eq('nook_id', nookId)
      .single();

    if (fetchError || !message)
      throw new NotFoundException('Message not found');

    // Check if user is creator or admin
    const isCreator = message.user_id === userId;
    const isNookCreator = message.nook?.creator_id === userId;
    // TODO: Add admin check

    if (!isCreator && !isNookCreator) {
      throw new ForbiddenException(
        'Only message author or nook creator can delete',
      );
    }

    // Delete message
    const { error: deleteError } = await this.admin
      .from('nook_messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    // Update nook message count
    const { data: nook } = await this.admin
      .from('nooks')
      .select('messages_count')
      .eq('id', nookId)
      .single();

    await this.admin
      .from('nooks')
      .update({
        messages_count: Math.max(0, (nook?.messages_count || 1) - 1),
      })
      .eq('id', nookId);

    return {
      success: true,
      message: 'Message deleted successfully',
    };
  }

  /**
   * Resolve display name: real name if revealed, otherwise username.
   */
  private resolveDisplayName(
    user: any,
    revealedIds: Set<string>,
    currentUserId: string,
  ): string {
    if (!user) return 'User';

    const isOwnMessage = user.id === currentUserId;
    const isRevealed = revealedIds.has(user.id);

    if (isOwnMessage || isRevealed) {
      const realName = this.identityReveal.decryptRealName(
        user.first_name_encrypted,
        user.last_name_encrypted,
      );
      if (realName) return realName;
    }
    return user.username || 'User';
  }

  private async updateNookTemperature(nookId: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { count: recentMessages } = await this.admin
      .from('nook_messages')
      .select('*', { count: 'exact', head: true })
      .eq('nook_id', nookId)
      .gte('created_at', oneHourAgo.toISOString());

    let temperature = 'cool';
    if ((recentMessages || 0) >= 10) {
      temperature = 'hot';
    } else if ((recentMessages || 0) >= 3) {
      temperature = 'warm';
    }

    await this.admin.from('nooks').update({ temperature }).eq('id', nookId);
  }
}
