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
import { MSG } from '../../../common/constants/messages';
import { ContentSafetyService } from '../../content-safety/content-safety.service';
import { RedisService } from '../../../common/services/redis.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NookMessagesService {
  private admin;

  constructor(
    private config: ConfigService,
    private identityReveal: IdentityRevealUtil,
    private mentionService: MentionService,
    private notificationsService: NotificationsService,
    private okestraService: OkestraService,
    private contentSafety: ContentSafetyService,
    private redis: RedisService,
    @InjectQueue('moderation') private moderationQueue: Queue,
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

    if (nookError || !nook) throw new NotFoundException(MSG.NOOK.NOT_FOUND);

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
      .or('is_hidden.is.null,is_hidden.eq.false')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) throw new BadRequestException(error.message);

    // Filter out blocked users' messages and user-hidden messages
    const [blockedIds, hiddenIds] = await Promise.all([
      this.contentSafety.getBlockedUserIds(userId),
      this.contentSafety.getHiddenContentIds(userId, 'nook_message'),
    ]);
    const blockedSet = new Set(blockedIds);
    const hiddenSet = new Set(hiddenIds);
    const filterMsg = (m: any) =>
      !blockedSet.has(m.user_id) && !hiddenSet.has(m.id);

    const filteredMessages = (messages || []).filter(filterMsg);

    // Fetch ALL replies in this nook (all descendants, not just direct children)
    const messageIds = filteredMessages.map((m: any) => m.id);
    let allReplyMessages: any[] = [];

    if (messageIds.length > 0) {
      const { data: allReplies } = await this.admin
        .from('nook_messages')
        .select(messageSelect)
        .eq('nook_id', nookId)
        .not('parent_message_id', 'is', null)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('created_at', { ascending: true });

      allReplyMessages = (allReplies || []).filter(filterMsg);
    }

    // Build a map of all messages (top-level + replies) for tree building
    const messageMap = new Map<string, any>();
    for (const msg of filteredMessages) {
      messageMap.set(msg.id, { ...msg, replies: [] });
    }
    for (const reply of allReplyMessages) {
      messageMap.set(reply.id, { ...reply, replies: [] });
    }

    // Build tree: attach each reply to its parent
    const rootMessages: any[] = [];
    for (const msg of filteredMessages) {
      rootMessages.push(messageMap.get(msg.id));
    }
    for (const reply of allReplyMessages) {
      const parent = messageMap.get(reply.parent_message_id);
      if (parent) {
        parent.replies.push(messageMap.get(reply.id));
      }
    }

    // Collect all unique OTHER user IDs from the full tree
    const otherUserIdSet = new Set<string>();
    const collectUserIds = (msgs: any[]) => {
      for (const msg of msgs) {
        if (msg.user_id && msg.user_id !== userId)
          otherUserIdSet.add(msg.user_id);
        if (msg.replies?.length) collectUserIds(msg.replies);
      }
    };
    collectUserIds(rootMessages);
    const otherUserIds = Array.from(otherUserIdSet);

    // Get revealed user IDs in a single query
    const revealedIds = await this.identityReveal.getRevealedUserIds(
      userId,
      otherUserIds,
    );

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
      const displayName = this.resolveDisplayName(
        user,
        revealedIds,
        userId,
        message.is_anonymous,
        authorId,
      );

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
          avatar: user?.avatar || '👤',
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
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
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
      is_anonymous = false,
    } = createMessageDto;

    // Check nook exists and is active (select only needed fields)
    const { data: nook, error: nookError } = await this.admin
      .from('nooks')
      .select('id, is_active, is_locked, expires_at, messages_count')
      .eq('id', nookId)
      .single();

    if (nookError || !nook) throw new NotFoundException(MSG.NOOK.NOT_FOUND);

    if (!nook.is_active || nook.is_locked) {
      throw new BadRequestException(MSG.NOOK.INACTIVE);
    }

    if (new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException(MSG.NOOK.EXPIRED);
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
        throw new BadRequestException(MSG.NOOK.PARENT_NOT_FOUND);
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
      .select('id', { count: 'exact', head: true })
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
      this.mentionService.processMentions(
        userId,
        usernames,
        'nook_message',
        message.id,
        nookId,
      );
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
          const actorName = await this.identityReveal.resolveNotificationName(
            userId,
            parentMsg.user_id,
          );

          await this.notificationsService.createNotification({
            user_id: parentMsg.user_id,
            actor_id: userId,
            type: 'nook_reply',
            title: 'New Reply',
            message: `${actorName} replied to your message in a nook`,
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

    // Enqueue AI moderation (fire-and-forget — never blocks the user)
    this.moderationQueue
      .add(
        'moderate',
        {
          contentType: 'nook_message',
          contentId: message.id,
          authorId: userId,
        },
        { jobId: `nook_message-${message.id}` },
      )
      .then(() => {
        logger.info('Moderation queued', {
          contentType: 'nook_message',
          contentId: message.id,
        });
      })
      .catch((mqErr) => {
        logger.warn('Failed to enqueue moderation', {
          messageId: message.id,
          error: mqErr,
        });
      });

    return {
      success: true,
      data: { message: { ...message, is_mine: true } },
      message: MSG.NOOK.MESSAGE_POSTED,
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
      throw new NotFoundException(MSG.NOOK.MESSAGE_NOT_FOUND);
    if (message.is_deleted)
      throw new NotFoundException(MSG.NOOK.MESSAGE_NOT_FOUND);

    // Check if user is creator or admin
    const isCreator = message.user_id === userId;
    const isNookCreator = message.nook?.creator_id === userId;

    if (!isCreator && !isNookCreator) {
      throw new ForbiddenException(
        'Only message author or nook creator can delete',
      );
    }

    // Recursive collect: message + all reply descendants
    const idsToDelete = await this.collectMessageDescendants(messageId);

    // Soft-delete all collected messages
    const now = new Date().toISOString();
    const { error: deleteError } = await this.admin
      .from('nook_messages')
      .update({ is_deleted: true, deleted_at: now })
      .in('id', idsToDelete);

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
        messages_count: Math.max(
          0,
          (nook?.messages_count || 0) - idsToDelete.length,
        ),
      })
      .eq('id', nookId);

    // Invalidate AI insights cache for this nook
    this.okestraService.invalidateCache('nook', nookId).catch(() => {});

    await this.redis.delPattern('nooks:*');
    await this.redis.delPattern('feeds:*');

    return {
      success: true,
      message: MSG.NOOK.MESSAGE_DELETED,
      deleted_count: idsToDelete.length,
    };
  }

  private async collectMessageDescendants(
    messageId: string,
  ): Promise<string[]> {
    const ids = [messageId];
    const { data: children } = await this.admin
      .from('nook_messages')
      .select('id')
      .eq('parent_message_id', messageId)
      .or('is_deleted.is.null,is_deleted.eq.false');

    if (children && children.length > 0) {
      for (const child of children) {
        const childIds = await this.collectMessageDescendants(child.id);
        ids.push(...childIds);
      }
    }
    return ids;
  }

  async editMessage(
    nookId: string,
    messageId: string,
    userId: string,
    content: string,
  ) {
    const { data: message, error: fetchError } = await this.admin
      .from('nook_messages')
      .select('id, user_id, nook_id, is_removed')
      .eq('id', messageId)
      .eq('nook_id', nookId)
      .single();

    if (fetchError || !message)
      throw new NotFoundException(MSG.NOOK.MESSAGE_NOT_FOUND);
    if (message.user_id !== userId)
      throw new ForbiddenException(MSG.NOOK.NOT_AUTHOR);
    if (message.is_removed)
      throw new BadRequestException(MSG.NOOK.EDIT_REMOVED);

    const { data: nook } = await this.admin
      .from('nooks')
      .select('id, is_active, is_locked, expires_at')
      .eq('id', nookId)
      .single();

    if (!nook?.is_active || nook.is_locked) {
      throw new BadRequestException(MSG.NOOK.INACTIVE);
    }
    if (new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException(MSG.NOOK.EXPIRED);
    }

    const { data: updated, error: updateError } = await this.admin
      .from('nook_messages')
      .update({
        content,
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select('id, content, is_edited, updated_at')
      .single();

    if (updateError) throw new BadRequestException(updateError.message);

    return {
      success: true,
      data: { message: updated },
      message: MSG.NOOK.MESSAGE_UPDATED,
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

    // Anonymous hides the real name, not the username
    return user.username || 'Unknown';
  }

  private async updateNookTemperature(nookId: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { count: recentMessages } = await this.admin
      .from('nook_messages')
      .select('id', { count: 'exact', head: true })
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
