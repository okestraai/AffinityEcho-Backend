import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import {
  CreateConversationDto,
  GetConversationsDto,
  ClearConversationDto,
} from '../dto/conversations.dto';
import logger from '../../../common/utils/logger.util';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ConversationsService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async createConversation(userId: string, dto: CreateConversationDto) {
    logger.info('Creating conversation', {
      userId,
      otherUserId: dto.other_user_id,
    });

    try {
      // Prevent self-conversation
      if (userId === dto.other_user_id) {
        throw new BadRequestException(
          'Cannot create a conversation with yourself',
        );
      }

      // Check if user exists and get their messaging preference
      const { data: otherUser, error: userError } = await this.admin
        .from('user_profiles')
        .select(
          'id, username, avatar, allow_messages_from, is_company_verified',
        )
        .eq('id', dto.other_user_id)
        .single();

      if (userError || !otherUser) {
        throw new NotFoundException(MSG.MESSAGING.USER_NOT_FOUND);
      }

      // Block check — prevent conversations between blocked users
      const { data: block } = await this.admin
        .from('user_blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${dto.other_user_id}),and(blocker_id.eq.${dto.other_user_id},blocked_id.eq.${userId})`,
        )
        .maybeSingle();

      if (block) {
        throw new ForbiddenException(MSG.MESSAGING.CANNOT_MESSAGE);
      }

      // Enforce allow_messages_from preference
      const messagePref = otherUser.allow_messages_from || 'everyone';

      if (messagePref === 'no_one') {
        throw new ForbiddenException('This user does not accept messages');
      }

      if (messagePref === 'connections') {
        const { data: followCheck } = await this.admin
          .from('user_follows')
          .select('id')
          .eq('follower_id', userId)
          .eq('following_id', dto.other_user_id)
          .maybeSingle();

        if (!followCheck) {
          throw new ForbiddenException(
            'You must be connected with this user to send messages',
          );
        }
      }

      // Check if conversation already exists between these users with same type
      let existingQuery = this.admin
        .from('conversations')
        .select(
          'id, context_type, context_id, user1_id, user2_id, user1_deleted_at, user2_deleted_at, user1_cleared_at, user2_cleared_at',
        )
        .or(
          `and(user1_id.eq.${userId},user2_id.eq.${dto.other_user_id}),and(user1_id.eq.${dto.other_user_id},user2_id.eq.${userId})`,
        )
        .eq('context_type', dto.context_type);

      // .eq() doesn't match NULL — use .is() for null context_id
      if (dto.context_id) {
        existingQuery = existingQuery.eq('context_id', dto.context_id);
      } else {
        existingQuery = existingQuery.is('context_id', null);
      }

      const { data: existingConv } = await existingQuery.maybeSingle();

      if (existingConv) {
        // If current user had previously deleted or cleared this conversation, restore it
        const isUser1 = existingConv.user1_id === userId;
        const deleteField = isUser1 ? 'user1_deleted_at' : 'user2_deleted_at';
        const clearField = isUser1 ? 'user1_cleared_at' : 'user2_cleared_at';
        const wasHidden =
          (isUser1
            ? existingConv.user1_deleted_at
            : existingConv.user2_deleted_at) ||
          (isUser1
            ? existingConv.user1_cleared_at
            : existingConv.user2_cleared_at);

        if (wasHidden) {
          await this.admin
            .from('conversations')
            .update({ [deleteField]: null, [clearField]: null })
            .eq('id', existingConv.id);
        }

        return {
          success: true,
          message: MSG.MESSAGING.CONV_EXISTS,
          data: {
            conversation_id: existingConv.id,
            already_exists: true,
            context_type: existingConv.context_type,
            other_user: {
              id: otherUser.id,
              username: otherUser.username,
              avatar: otherUser.avatar,
              is_company_verified: otherUser.is_company_verified || false,
            },
          },
        };
      }

      // Check if identity is already revealed between the pair
      const alreadyRevealed = await this.identityReveal.isRevealed(
        userId,
        dto.other_user_id,
      );

      // Create conversation
      const conversationData: any = {
        user1_id: userId,
        user2_id: dto.other_user_id,
        context_type: dto.context_type,
        context_id: dto.context_id,
        is_active: true,
        last_message_at: new Date().toISOString(),
      };

      if (alreadyRevealed) {
        conversationData.user1_identity_revealed = true;
        conversationData.user2_identity_revealed = true;
      }

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
            is_company_verified: otherUser.is_company_verified || false,
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

      if (error instanceof Error) {
        logger.error(MSG.MESSAGING.CREATE_FAILED, {
          error: error.message,
          stack: error.stack,
          userId,
        });
      } else {
        logger.error(MSG.MESSAGING.CREATE_FAILED, {
          error: String(error),
          userId,
        });
      }
      throw new BadRequestException(MSG.MESSAGING.CREATE_FAILED);
    }
  }

  async getConversations(userId: string, dto: GetConversationsDto) {
    try {
      logger.info('Getting conversations for user', { userId, ...dto });

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
        user1_deleted_at,
        user2_deleted_at,
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

      if (error) {
        logger.error('Supabase query error in getConversations', {
          error: error.message || String(error),
          details: error.details,
          hint: error.hint,
          code: error.code,
          userId,
        });
        throw error;
      }

      logger.info(
        `Found ${conversations?.length || 0} conversations for user ${userId}`,
      );

      // Filter out conversations hidden by this user (deleted or cleared),
      // unless new messages arrived after the hide timestamp
      const visibleConversations = (conversations || []).filter((conv: any) => {
        const isUser1 = conv.user1_id === userId;
        const deletedAt = isUser1
          ? conv.user1_deleted_at
          : conv.user2_deleted_at;
        const clearedAt = isUser1
          ? conv.user1_cleared_at
          : conv.user2_cleared_at;

        // Use whichever hide timestamp is more recent
        const hideAt =
          deletedAt && clearedAt
            ? new Date(deletedAt) > new Date(clearedAt)
              ? deletedAt
              : clearedAt
            : deletedAt || clearedAt;

        if (!hideAt) return true; // Not hidden by this user

        // Show only if a new message arrived after the hide timestamp
        return (
          conv.last_message_at &&
          new Date(conv.last_message_at) > new Date(hideAt)
        );
      });

      // If no conversations, return empty array
      if (!visibleConversations || visibleConversations.length === 0) {
        return {
          success: true,
          data: {
            conversations: [],
            total: 0,
            page: Math.floor(offset / limit) + 1,
            limit: limit,
            total_pages: 0,
          },
        };
      }

      // Get all other user IDs first
      const otherUserIds = visibleConversations.map((conv: any) =>
        conv.user1_id === userId ? conv.user2_id : conv.user1_id,
      );

      logger.info(
        `Fetching ${otherUserIds.length} other users for conversations`,
      );

      // Batch fetch all other users at once - include encrypted name fields for identity reveal
      const { data: otherUsers, error: usersError } = await this.admin
        .from('user_profiles')
        .select(
          'id, username, avatar, job_title, company_encrypted, mentoring_as, first_name_encrypted, last_name_encrypted, is_company_verified',
        )
        .in('id', otherUserIds);

      if (usersError) {
        logger.error('Supabase query error for user_profiles', {
          error: usersError.message || String(usersError),
          details: usersError.details,
          hint: usersError.hint,
          code: usersError.code,
          userId,
        });
        throw usersError;
      }

      logger.info(`Found ${otherUsers?.length || 0} other users`);

      // Create a map for quick lookup
      const usersMap = new Map();
      otherUsers?.forEach((user: any) => {
        usersMap.set(user.id, user);
      });

      // Batch-fetch last messages, unread counts, and mentorship contexts
      // instead of querying per-conversation in a loop (eliminates 3N queries)
      const conversationIds = visibleConversations.map((c: any) => c.id);

      // Fetch last messages for ALL conversations in one query using DISTINCT ON
      // Supabase doesn't support DISTINCT ON, so we fetch recent messages and deduplicate
      const [lastMessagesResult] = await Promise.all([
        this.admin
          .from('messages')
          .select(
            'conversation_id, content_encrypted, content_type, created_at, sender_id',
          )
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false }),
      ]);

      // Build last-message map (keep only the most recent per conversation)
      const lastMessageMap = new Map<string, any>();
      (lastMessagesResult.data || []).forEach((msg: any) => {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }
      });

      // Build unread-count map by counting per conversation client-side
      // (Supabase count returns total, so we count from the unread messages)
      const unreadCountMap = new Map<string, number>();
      // Re-query unread with full data to count per conversation
      const { data: unreadMessages } = await this.admin
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .eq('is_read', false)
        .not('sender_id', 'eq', userId);

      (unreadMessages || []).forEach((msg: any) => {
        unreadCountMap.set(
          msg.conversation_id,
          (unreadCountMap.get(msg.conversation_id) || 0) + 1,
        );
      });

      // Batch-fetch mentorship relationships for mentorship conversations
      const mentorshipConvs = visibleConversations.filter(
        (c: any) => c.context_type === 'mentorship' && c.context_id,
      );
      const mentorshipContextIds = mentorshipConvs.map(
        (c: any) => c.context_id,
      );
      const mentorshipMap = new Map<string, any>();

      if (mentorshipContextIds.length > 0) {
        const { data: relationships } = await this.admin
          .from('mentorship_relationships')
          .select('id, status, mentor_id, mentee_id')
          .in('id', mentorshipContextIds);

        (relationships || []).forEach((rel: any) => {
          mentorshipMap.set(rel.id, rel);
        });
      }

      // Now build enhanced conversations without any per-conversation queries
      const enhancedConversations = visibleConversations.map((conv: any) => {
        const otherUserId =
          conv.user1_id === userId ? conv.user2_id : conv.user1_id;

        // Get other user info from map
        const otherUser = usersMap.get(otherUserId);

        // Get last message from batch map
        const lastMessage = lastMessageMap.get(conv.id) || null;

        // Get unread count from batch map
        const unreadCount = unreadCountMap.get(conv.id) || 0;

        // Get mentorship context from batch map
        let mentorshipContext = null;
        if (conv.context_type === 'mentorship' && conv.context_id) {
          const relationship = mentorshipMap.get(conv.context_id);
          if (relationship) {
            mentorshipContext = {
              relationship_id: conv.context_id,
              role: relationship.mentor_id === userId ? 'mentor' : 'mentee',
              status: relationship.status,
            };
          }
        }

        // Check if the OTHER user's identity is revealed to current user
        // user1_identity_revealed = user1 revealed their identity (user2 can see it)
        // user2_identity_revealed = user2 revealed their identity (user1 can see it)
        const otherUserRevealed =
          conv.user1_id === userId
            ? conv.user2_identity_revealed // I'm user1, can I see user2's real name?
            : conv.user1_identity_revealed; // I'm user2, can I see user1's real name?

        const identityRevealed =
          conv.user1_id === userId
            ? conv.user1_identity_revealed
            : conv.user2_identity_revealed;

        // Decrypt company if available
        let companyDecrypted = null;
        if (otherUser?.company_encrypted) {
          try {
            companyDecrypted = this.encryption.decrypt(
              otherUser.company_encrypted,
            );
          } catch (decryptError) {
            logger.debug('Failed to decrypt company', {
              userId: otherUser.id,
              error:
                decryptError instanceof Error
                  ? decryptError.message
                  : String(decryptError),
            });
          }
        }

        // Decrypt career level if available
        let careerLevelDecrypted = null;
        if (otherUser?.career_level_encrypted) {
          try {
            careerLevelDecrypted = this.encryption.decrypt(
              otherUser.career_level_encrypted,
            );
          } catch (decryptError) {
            logger.debug('Failed to decrypt career level', {
              userId: otherUser.id,
              error:
                decryptError instanceof Error
                  ? decryptError.message
                  : String(decryptError),
            });
          }
        }

        // Decrypt real name if identity is revealed
        let displayName = otherUser?.username || 'Anonymous';
        if (otherUserRevealed && otherUser) {
          const realName = this.identityReveal.decryptRealName(
            otherUser.first_name_encrypted,
            otherUser.last_name_encrypted,
          );
          if (realName) displayName = realName;
        }

        // Build conversation object
        return {
          id: conv.id,
          other_user: {
            id: otherUserId,
            username: otherUser?.username || 'Anonymous',
            display_name: displayName,
            avatar: otherUser?.avatar || '👤',
            job_title: otherUser?.job_title,
            company: companyDecrypted || null,
            career_level: careerLevelDecrypted || null,
            mentoring_as: otherUser?.mentoring_as,
            is_company_verified: otherUser?.is_company_verified || false,
          },
          last_message: lastMessage
            ? {
                content_preview: lastMessage.content_encrypted
                  ? (() => {
                      try {
                        // Check if it's likely plain text
                        const isLikelyPlainText =
                          /^[A-Za-z0-9\s.,!?'"()\-:;]+$/.test(
                            lastMessage.content_encrypted,
                          ) &&
                          lastMessage.content_encrypted.length < 1000 &&
                          !lastMessage.content_encrypted.includes('==') &&
                          !lastMessage.content_encrypted.includes('+/');

                        if (isLikelyPlainText) {
                          return lastMessage.content_encrypted.substring(
                            0,
                            100,
                          );
                        }

                        // Try to decrypt
                        return this.encryption
                          .decrypt(lastMessage.content_encrypted)
                          .substring(0, 100);
                      } catch (decryptError) {
                        logger.debug('Failed to decrypt message preview', {
                          conversationId: conv.id,
                          error:
                            decryptError instanceof Error
                              ? decryptError.message
                              : String(decryptError),
                        });
                        return (
                          lastMessage.content_encrypted?.substring(0, 100) ||
                          '[Encrypted message]'
                        );
                      }
                    })()
                  : '',
                sender_id: lastMessage.sender_id,
                sent_at: lastMessage.created_at,
                content_type: lastMessage.content_type,
              }
            : null,
          unread_count: unreadCount,
          chat_type: conv.context_type,
          mentorship_context: mentorshipContext,
          identity_revealed: identityRevealed,
          updated_at: conv.updated_at,
          last_activity_at: conv.last_message_at,
        };
      });

      // Filter by search term if provided
      let filteredConversations = enhancedConversations;
      if (search) {
        filteredConversations = enhancedConversations.filter(
          (conv: any) =>
            conv.other_user.username
              .toLowerCase()
              .includes(search.toLowerCase()) ||
            conv.last_message?.content_preview
              ?.toLowerCase()
              .includes(search.toLowerCase()),
        );
      }

      // Get total count for pagination
      let totalCount = 0;
      try {
        let countQuery = this.admin
          .from('conversations')
          .select('id', { count: 'exact' })
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .eq('is_active', true);

        if (chatType !== 'all') {
          countQuery = countQuery.eq('context_type', chatType);
        }

        const { count } = await countQuery;
        totalCount = count || 0;
      } catch (countError) {
        logger.warn('Failed to get total conversation count', {
          error:
            countError instanceof Error
              ? countError.message
              : String(countError),
          userId,
        });
        // Use conversations length as fallback
        totalCount = conversations.length;
      }

      logger.info('Successfully processed conversations', {
        userId,
        totalCount,
        filteredCount: filteredConversations.length,
      });

      return {
        success: true,
        data: {
          conversations: filteredConversations,
          total: totalCount,
          page: Math.floor(offset / limit) + 1,
          limit: limit,
          total_pages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      // More detailed error logging
      if (error instanceof Error) {
        logger.error(MSG.MESSAGING.FETCH_FAILED, {
          error: error.message,
          stack: error.stack,
          name: error.name,
          userId,
        });
      } else {
        // Try to stringify the error object for better logging
        try {
          const errorStr = JSON.stringify(
            error,
            Object.getOwnPropertyNames(error),
          );
          logger.error('Failed to get conversations (non-Error object)', {
            error: errorStr,
            errorType: typeof error,
            userId,
          });
        } catch (stringifyError) {
          logger.error('Failed to get conversations (cannot stringify error)', {
            error: String(error),
            errorType: typeof error,
            userId,
          });
        }
      }
      throw new BadRequestException(MSG.MESSAGING.FETCH_FAILED);
    }
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
    limit: number = 50,
    before?: string,
  ) {
    try {
      logger.info('Getting messages for conversation', {
        userId,
        conversationId,
        limit,
        before,
      });

      // Verify conversation access and get identity reveal flags + deletion timestamps
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select(
          'user1_id, user2_id, user1_identity_revealed, user2_identity_revealed, user1_deleted_at, user2_deleted_at',
        )
        .eq('id', conversationId)
        .single();

      if (convError) {
        logger.error('Supabase conversation query error', {
          error: convError.message || String(convError),
          conversationId,
          userId,
        });
        throw new NotFoundException(MSG.MESSAGING.CONV_NOT_FOUND);
      }

      if (!conversation) {
        logger.warn(MSG.MESSAGING.CONV_NOT_FOUND, { conversationId, userId });
        throw new NotFoundException(MSG.MESSAGING.CONV_NOT_FOUND);
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        logger.warn('User not authorized for conversation', {
          conversationId,
          userId,
          conversationUser1: conversation.user1_id,
          conversationUser2: conversation.user2_id,
        });
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

      if (error) {
        logger.error('Supabase messages query error', {
          error: error.message || String(error),
          conversationId,
          userId,
        });
        throw error;
      }

      logger.info(
        `Found ${messages?.length || 0} messages for conversation ${conversationId}`,
      );

      // Filter out messages soft-deleted by this user or sent before their deletion timestamp
      const isUser1 = conversation.user1_id === userId;
      const userDeletedAt = isUser1
        ? conversation.user1_deleted_at
        : conversation.user2_deleted_at;
      const deleteFlag = isUser1 ? 'deleted_by_user1' : 'deleted_by_user2';

      const filteredMessages = (messages || []).filter((msg: any) => {
        // Exclude individually deleted messages
        if (msg[deleteFlag] === true) return false;

        // Exclude messages created before the user's conversation deletion timestamp
        if (
          userDeletedAt &&
          new Date(msg.created_at) <= new Date(userDeletedAt)
        ) {
          return false;
        }

        return true;
      });

      // Determine if identity is revealed (mutual — both flags set together)
      const isRevealed =
        conversation.user1_identity_revealed &&
        conversation.user2_identity_revealed;

      // Batch fetch unique sender profiles
      const senderIds = [
        ...new Set(filteredMessages.map((msg: any) => msg.sender_id)),
      ];
      const { data: senderProfiles } = await this.admin
        .from('user_profiles')
        .select(
          'id, username, avatar, first_name_encrypted, last_name_encrypted, is_company_verified',
        )
        .in('id', senderIds);

      const sendersMap = new Map<string, any>();
      (senderProfiles || []).forEach((s: any) => sendersMap.set(s.id, s));

      // Build enhanced messages with display_name
      const enhancedMessages = filteredMessages.map((msg: any) => {
        const sender = sendersMap.get(msg.sender_id);
        let displayName = sender?.username || 'Anonymous';

        if (isRevealed && sender) {
          const realName = this.identityReveal.decryptRealName(
            sender.first_name_encrypted,
            sender.last_name_encrypted,
          );
          if (realName) displayName = realName;
        }

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
          is_edited: msg.is_edited || false,
          edited_at: msg.edited_at || null,
          sent_at: msg.created_at,
          sender_info: {
            username: sender?.username || 'Anonymous',
            display_name: displayName,
            avatar: sender?.avatar || '👤',
            is_company_verified: sender?.is_company_verified || false,
          },
        };
      });

      // Mark messages as delivered if they were sent to this user
      const undeliveredMessages = filteredMessages.filter(
        (msg: any) => !msg.is_delivered && msg.sender_id !== userId,
      );

      if (undeliveredMessages.length > 0) {
        try {
          await this.admin
            .from('messages')
            .update({ is_delivered: true })
            .in(
              'id',
              undeliveredMessages.map((msg: any) => msg.id),
            );
          logger.info(
            `Marked ${undeliveredMessages.length} messages as delivered`,
          );
        } catch (updateError) {
          logger.warn('Failed to mark messages as delivered', {
            conversationId,
            error:
              updateError instanceof Error
                ? updateError.message
                : String(updateError),
          });
        }
      }

      // Check if there are more messages
      let totalCount = 0;
      let hasMore = false;
      try {
        const { count } = await this.admin
          .from('messages')
          .select('id', { count: 'exact' })
          .eq('conversation_id', conversationId);

        totalCount = count || 0;
        hasMore = totalCount > filteredMessages.length;
      } catch (countError) {
        logger.warn('Failed to get total message count', {
          conversationId,
          error:
            countError instanceof Error
              ? countError.message
              : String(countError),
        });
        hasMore = false;
      }

      logger.info('Successfully processed messages', {
        conversationId,
        totalCount,
        displayedCount: filteredMessages.length,
        hasMore,
      });

      return {
        success: true,
        data: {
          conversation_id: conversationId,
          messages: enhancedMessages.reverse(), // Reverse to show oldest first
          has_more: hasMore,
          total_count: totalCount,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      if (error instanceof Error) {
        logger.error('Failed to get messages', {
          error: error.message,
          stack: error.stack,
          name: error.name,
          userId,
          conversationId,
        });
      } else {
        try {
          const errorStr = JSON.stringify(
            error,
            Object.getOwnPropertyNames(error),
          );
          logger.error('Failed to get messages (non-Error object)', {
            error: errorStr,
            errorType: typeof error,
            userId,
            conversationId,
          });
        } catch (stringifyError) {
          logger.error('Failed to get messages (cannot stringify error)', {
            error: String(error),
            errorType: typeof error,
            userId,
            conversationId,
          });
        }
      }
      throw new BadRequestException('Failed to get messages');
    }
  }

  async deleteConversation(userId: string, conversationId: string) {
    try {
      logger.info('Deleting conversation', { userId, conversationId });

      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException(MSG.MESSAGING.CONV_NOT_FOUND);
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException(MSG.MESSAGING.NOT_AUTHORIZED);
      }

      // Set deleted_at for this user
      const deleteField =
        conversation.user1_id === userId
          ? 'user1_deleted_at'
          : 'user2_deleted_at';

      const { error } = await this.admin
        .from('conversations')
        .update({ [deleteField]: new Date().toISOString() })
        .eq('id', conversationId);

      if (error) throw error;

      logger.info('Successfully deleted conversation', {
        conversationId,
        userId,
        deleteField,
      });

      return {
        success: true,
        data: {
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

      if (error instanceof Error) {
        logger.error(MSG.MESSAGING.DELETE_FAILED, {
          error: error.message,
          stack: error.stack,
          userId,
          conversationId,
        });
      } else {
        logger.error(MSG.MESSAGING.DELETE_FAILED, {
          error: String(error),
          userId,
          conversationId,
        });
      }
      throw new BadRequestException(MSG.MESSAGING.DELETE_FAILED);
    }
  }

  async clearConversation(userId: string, dto: ClearConversationDto) {
    try {
      logger.info('Clearing conversation', {
        userId,
        conversationId: dto.conversation_id,
      });

      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('id', dto.conversation_id)
        .single();

      if (convError) {
        logger.error('Supabase conversation query error in clearConversation', {
          error: convError.message || String(convError),
          conversationId: dto.conversation_id,
          userId,
        });
        throw new NotFoundException(MSG.MESSAGING.CONV_NOT_FOUND);
      }

      if (!conversation) {
        logger.warn('Conversation not found for clearing', {
          conversationId: dto.conversation_id,
          userId,
        });
        throw new NotFoundException(MSG.MESSAGING.CONV_NOT_FOUND);
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        logger.warn('User not authorized to clear conversation', {
          conversationId: dto.conversation_id,
          userId,
          conversationUser1: conversation.user1_id,
          conversationUser2: conversation.user2_id,
        });
        throw new ForbiddenException(MSG.MESSAGING.NOT_AUTHORIZED);
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

      if (error) {
        logger.error('Supabase update error in clearConversation', {
          error: error.message || String(error),
          conversationId: dto.conversation_id,
          userId,
          updateField,
        });
        throw error;
      }

      logger.info('Successfully cleared conversation', {
        conversationId: dto.conversation_id,
        userId,
        updateField,
      });

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

      if (error instanceof Error) {
        logger.error(MSG.MESSAGING.CLEAR_FAILED, {
          error: error.message,
          stack: error.stack,
          name: error.name,
          userId,
          conversationId: dto.conversation_id,
        });
      } else {
        try {
          const errorStr = JSON.stringify(
            error,
            Object.getOwnPropertyNames(error),
          );
          logger.error('Failed to clear conversation (non-Error object)', {
            error: errorStr,
            errorType: typeof error,
            userId,
            conversationId: dto.conversation_id,
          });
        } catch (stringifyError) {
          logger.error(
            'Failed to clear conversation (cannot stringify error)',
            {
              error: String(error),
              errorType: typeof error,
              userId,
              conversationId: dto.conversation_id,
            },
          );
        }
      }
      throw new BadRequestException(MSG.MESSAGING.CLEAR_FAILED);
    }
  }
}
