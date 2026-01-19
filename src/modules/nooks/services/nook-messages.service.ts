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

@Injectable()
export class NookMessagesService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getMessages(nookId: string, query: MessageQueryDto, userId: string) {
    const { page = 1, limit = 20, sortOrder = 'asc' } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Check nook exists
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('*')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException('Nook not found');

    // Check user is member
    const { data: membership } = await this.admin
      .from('nook_members')
      .select('id')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      throw new ForbiddenException('You must be a member to view messages');
    }

    // Get messages
    const {
      data: messages,
      error,
      count,
    } = await this.admin
      .from('nook_messages')
      .select(
        `
        *,
        user:user_id (
          id,
          username,
          avatar
        )
      `,
        { count: 'exact' },
      )
      .eq('nook_id', nookId)
      .is('parent_message_id', null)
      .order('created_at', { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) throw new BadRequestException(error.message);

    // Get replies for each message
    const messagesWithReplies = await Promise.all(
      (messages || []).map(async (message) => {
        const { data: replies } = await this.admin
          .from('nook_messages')
          .select(
            `
            *,
            user:user_id (
              id,
              username,
              avatar
            )
          `,
          )
          .eq('parent_message_id', message.id)
          .order('created_at', { ascending: true });

        return {
          ...message,
          user: {
            avatar: message.user?.avatar || 'User',
            username: message.is_anonymous
              ? 'Anonymous'
              : message.user?.username || 'User',
          },
          replies: (replies || []).map((reply) => ({
            ...reply,
            user: {
              avatar: reply.user?.avatar || 'User',
              username: reply.is_anonymous
                ? 'Anonymous'
                : reply.user?.username || 'User',
            },
          })),
        };
      }),
    );

    return {
      success: true,
      data: {
        messages: messagesWithReplies,
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

    // Check nook exists and is active
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('*')
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
    const { data: membership } = await this.admin
      .from('nook_members')
      .select('id, messages_sent')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      throw new ForbiddenException('You must be a member to post messages');
    }

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

    // Update nook stats
    await Promise.all([
      this.admin
        .from('nooks')
        .update({
          messages_count: (nook.messages_count || 0) + 1,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', nookId),
      this.admin
        .from('nook_members')
        .update({
          messages_sent: (membership.messages_sent || 0) + 1,
        })
        .eq('nook_id', nookId)
        .eq('user_id', userId),
    ]);

    // Update temperature based on message activity
    await this.updateNookTemperature(nookId);

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
