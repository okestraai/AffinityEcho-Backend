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
import { MentionService } from '../../mentions/mention.service';
import { NotificationsService } from '../../notifications/notifications.service';
import logger from '../../../common/utils/logger.util';
import { OkestraService } from '../../okestra/services/okestra.service';

@Injectable()
export class NookMessagesService {
  private admin;

  constructor(
    private config: ConfigService,
    private identityReveal: IdentityRevealUtil,
    private mentionService: MentionService,
    private notificationsService: NotificationsService,
    private okestraService: OkestraService,
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
        last_name_encrypted,
        is_company_verified
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

    // Fetch ALL replies in this nook (all descendants, not just direct children)
    const messageIds = (messages || []).map((m) => m.id);
    let allReplyMessages: any[] = [];

    if (messageIds.length > 0) {
      const { data: allReplies } = await this.admin
        .from('nook_messages')
        .select(messageSelect)
        .eq('nook_id', nookId)
        .not('parent_message_id', 'is', null)
        .order('created_at', { ascending: true });

      allReplyMessages = allReplies || [];
    }

    // Build a map of all messages (top-level + replies) for tree building
    const messageMap = new Map<string, any>();
    for (const msg of (messages || [])) {
      messageMap.set(msg.id, { ...msg, replies: [] });
    }
    for (const reply of allReplyMessages) {
      messageMap.set(reply.id, { ...reply, replies: [] });
    }

    // Build tree: attach each reply to its parent
    const rootMessages: any[] = [];
    for (const msg of (messages || [])) {
      rootMessages.push(messageMap.get(msg.id));
    }
    for (const reply of allReplyMessages) {
      const parent = messageMap.get(reply.parent_message_id);
      if (parent) {
        parent.replies.push(messageMap.get(reply.id));
      }
    }

    // Collect all unique OTHER user IDs from the full tree
    const otherUserIds: string[] = [];
    const collectUserIds = (msgs: any[]) => {
      for (const msg of msgs) {
        if (msg.user_id && msg.user_id !== userId) otherUserIds.push(msg.user_id);
        if (msg.replies?.length) collectUserIds(msg.replies);
      }
    };
    collectUserIds(rootMessages);

    // Get revealed user IDs in a single query
    const revealedIds = await this.identityReveal.getRevealedUserIds(userId, otherUserIds);

    // Apply identity reveal to messages and replies.
    // Rules:
    //   - Own message           → always show real name
    //   - Identity revealed     → show real name (even if anonymous)
    //   - Anonymous from others → show '👤' avatar + 'Anonymous' display (anonymity preserved)
    //   - Non-anonymous others  → show their username
    // Recursively process a message and its nested replies
    const processMessage = (message: any): any => {
      const authorId = message.user_id;
      const user = Array.isArray(message.user) ? message.user[0] : message.user;
      const showIdentity = authorId === userId || revealedIds.has(authorId);
      const displayName = this.resolveDisplayName(user, revealedIds, userId, message.is_anonymous, authorId);

      return {
        id: message.id,
        nook_id: message.nook_id,
        parent_message_id: message.parent_message_id,
        content: message.content,
        is_anonymous: message.is_anonymous,
        is_mine: authorId === userId,
        is_removed: message.is_removed,
        removed_reason: message.removed_reason,
        is_flagged: message.is_flagged,
        flagged_count: message.flagged_count,
        heard_count: message.heard_count,
        validated_count: message.validated_count,
        helpful_count: message.helpful_count,
        created_at: message.created_at,
        updated_at: message.updated_at,
        user: {
          id: showIdentity ? authorId : null,
          avatar: user?.avatar || 'User',
          username: user?.username || 'Unknown',
          display_name: displayName,
          is_company_verified: user?.is_company_verified || false,
        },
        replies: (message.replies || []).map(processMessage),
      };
    };

    const processedMessages = rootMessages.map(processMessage);

    // Sort: user's messages first (newest first), then others (newest first)
    processedMessages.sort((a: any, b: any) => {
      const aIsMine = a.is_mine ? 0 : 1;
      const bIsMine = b.is_mine ? 0 : 1;
      if (aIsMine !== bIsMine) return aIsMine - bIsMine;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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

    // Process @mentions in message content
    const usernames = this.mentionService.parseMentions(content);
    if (usernames.length > 0) {
      this.mentionService.processMentions(userId, usernames, 'nook_message', message.id, nookId);
    }

    // Send nook reply notification when replying to another user's message
    if (parent_message_id) {
      try {
        const { data: parentMsg } = await this.admin
          .from('nook_messages')
          .select('user_id')
          .eq('id', parent_message_id)
          .single();

        if (parentMsg && parentMsg.user_id !== userId) {
          const { data: replier } = await this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single();

          await this.notificationsService.createNotification({
            user_id: parentMsg.user_id,
            actor_id: userId,
            type: 'nook_reply',
            title: 'New Reply',
            message: `${replier?.username || 'Someone'} replied to your message in a nook`,
            action_url: `/nooks/${nookId}`,
            reference_id: parent_message_id,
            reference_type: 'nook_message',
            metadata: { nook_id: nookId, reply_message_id: message.id },
          });
        }
      } catch (notifError) {
        logger.warn('Failed to send nook reply notification', { notifError });
      }
    }

    // Invalidate AI insights cache for this nook
    this.okestraService.invalidateCache('nook', nookId).catch(() => {});

    return {
      success: true,
      data: { message: { ...message, is_mine: true } },
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

    // Invalidate AI insights cache for this nook
    this.okestraService.invalidateCache('nook', nookId).catch(() => {});

    return {
      success: true,
      message: 'Message deleted successfully',
    };
  }

  async editMessage(nookId: string, messageId: string, userId: string, content: string) {
    const { data: message, error: fetchError } = await this.admin
      .from('nook_messages')
      .select('id, user_id, nook_id, is_removed')
      .eq('id', messageId)
      .eq('nook_id', nookId)
      .single();

    if (fetchError || !message) throw new NotFoundException('Message not found');
    if (message.user_id !== userId) throw new ForbiddenException('Only the message author can edit');
    if (message.is_removed) throw new BadRequestException('Cannot edit a removed message');

    const { data: nook } = await this.admin
      .from('nooks')
      .select('id, is_active, is_locked, expires_at')
      .eq('id', nookId)
      .single();

    if (!nook?.is_active || nook.is_locked) {
      throw new BadRequestException('Nook is not active or is locked');
    }
    if (new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException('Nook has expired');
    }

    const { data: updated, error: updateError } = await this.admin
      .from('nook_messages')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', messageId)
      .select('id, content, updated_at')
      .single();

    if (updateError) throw new BadRequestException(updateError.message);

    return {
      success: true,
      data: { message: updated },
      message: 'Message updated successfully',
    };
  }

  /**
   * Resolve display name with identity reveal awareness.
   * - Own message or identity revealed → real name (falls back to username)
   * - Anonymous from others            → 'Anonymous'
   * - Non-anonymous from others        → username
   */
  private resolveDisplayName(
    user: any,
    revealedIds: Set<string>,
    currentUserId: string,
    isAnonymous: boolean = false,
    authorId?: string,
  ): string {
    if (!user) return 'Unknown';

    const effectiveId = authorId || user.id;
    const isOwnMessage = effectiveId === currentUserId;
    const isRevealed = revealedIds.has(effectiveId);

    if (isOwnMessage || isRevealed) {
      const realName = this.identityReveal.decryptRealName(
        user.first_name_encrypted,
        user.last_name_encrypted,
      );
      if (realName) return realName;
    }

    // Always fall back to username — anonymous hides the real name, not the username
    return user.username || 'Unknown';
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
