import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { EmailService } from '../../../common/utils/email/email.service';
import {
  RequestIdentityRevealDto,
  RespondIdentityRevealDto,
  GetIdentityRevealsDto,
} from '../dto/identity-reveal.dto';
import logger from '../../../common/utils/logger.util';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class IdentityRevealService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async requestReveal(userId: string, dto: RequestIdentityRevealDto) {
    logger.info('Requesting identity reveal', {
      userId,
      conversationId: dto.conversation_id,
    });

    try {
      // Get conversation details including identity revealed fields
      const { data: conversation, error: convError } = await this.admin
        .from('conversations')
        .select(
          'id, user1_id, user2_id, context_type, context_id, user1_identity_revealed, user2_identity_revealed',
        )
        .eq('id', dto.conversation_id)
        .single();

      if (convError || !conversation) {
        throw new NotFoundException('Conversation not found');
      }

      // Verify user is part of conversation
      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this conversation');
      }

      const otherUserId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      // Check if identity is already revealed in conversation
      const isRevealed =
        conversation.user1_id === userId
          ? conversation.user1_identity_revealed
          : conversation.user2_identity_revealed;

      if (isRevealed) {
        throw new BadRequestException(
          'Identity already revealed in this conversation',
        );
      }

      // Check for existing pending request (BOTH directions)
      const { data: existingRequest } = await this.admin
        .from('identity_reveals')
        .select('id, status, requester_id')
        .or(
          `and(requester_id.eq.${userId},responder_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},responder_id.eq.${userId})`,
        )
        .eq('status', 'pending')
        .maybeSingle();

      if (existingRequest) {
        throw new BadRequestException(
          'Identity reveal request already pending',
        );
      }

      // Create identity reveal request
      const revealData: any = {
        requester_id: userId,
        responder_id: otherUserId,
        status: 'pending',
        requester_message_encrypted: dto.message
          ? this.encryption.encrypt(dto.message)
          : null,
      };

      // Only add connection_id if it exists
      if (dto.connection_id) {
        revealData.connection_id = dto.connection_id;
      }

      const { data: reveal, error: revealError } = await this.admin
        .from('identity_reveals')
        .insert(revealData)
        .select()
        .single();

      if (revealError) throw revealError;

      // Send in-app notification and email
      try {
        const [{ data: responder }, { data: requester }] = await Promise.all([
          this.admin
            .from('user_profiles')
            .select('email, username, email_notifications')
            .eq('id', otherUserId)
            .single(),
          this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single(),
        ]);

        // Create in-app notification
        await this.notificationsService.createNotification({
          user_id: otherUserId,
          actor_id: userId,
          type: 'identity_reveal_request',
          title: 'Identity Reveal Request',
          message: `${requester?.username || 'Someone'} requested to reveal identities`,
          action_url: `/messages/identity-reveals/${reveal.id}`,
          reference_id: reveal.id,
          reference_type: 'identity_reveal',
          metadata: { conversation_id: conversation.id },
          delivery_method: ['in_app'],
        });

        // Send email notification (respects emailNotifications setting)
        if (responder?.email && responder.email_notifications !== false) {
          await this.emailService.sendIdentityRevealRequestEmail(
            responder.email,
            responder.username,
            conversation.id,
          );
        }
      } catch (notifyError) {
        logger.warn('Failed to send identity reveal notification', {
          notifyError,
        });
      }

      return {
        success: true,
        data: {
          reveal_id: reveal.id,
          conversation_id: conversation.id,
          status: reveal.status,
          requested_at: reveal.created_at,
        },
        message: 'Identity reveal request sent',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to request identity reveal', { error, userId });
      throw new BadRequestException('Failed to request identity reveal');
    }
  }

  async respondToReveal(userId: string, dto: RespondIdentityRevealDto) {
    // Normalize action: accept "accepted"/"rejected" as aliases
    const normalizedAction = dto.action.replace(/ed$/, '');
    dto.action =
      normalizedAction === 'accept' || normalizedAction === 'reject'
        ? normalizedAction
        : dto.action;

    logger.info('Responding to identity reveal', {
      userId,
      revealId: dto.reveal_id,
      action: dto.action,
    });

    try {
      // Get reveal request
      const { data: reveal, error: revealError } = await this.admin
        .from('identity_reveals')
        .select('*')
        .eq('id', dto.reveal_id)
        .single();

      if (revealError || !reveal) {
        throw new NotFoundException('Identity reveal request not found');
      }

      if (reveal.responder_id !== userId) {
        throw new ForbiddenException(
          'Not authorized to respond to this request',
        );
      }

      if (reveal.status !== 'pending') {
        throw new BadRequestException('Request is not pending');
      }

      // Update reveal status
      const updateData = {
        status: dto.action === 'accept' ? 'accepted' : 'rejected',
        responded_at: new Date().toISOString(),
      };

      const { data: updatedReveal, error: updateError } = await this.admin
        .from('identity_reveals')
        .update(updateData)
        .eq('id', dto.reveal_id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Mark the original identity_reveal_request notification as action_taken
      await this.notificationsService.markActionTakenByReference(
        userId,
        dto.reveal_id,
      );

      // If accepted, update ALL conversations between the two users
      if (dto.action === 'accept') {
        // First find all conversations between the two users
        const { data: conversations, error: findError } = await this.admin
          .from('conversations')
          .select('id')
          .or(
            `and(user1_id.eq.${reveal.requester_id},user2_id.eq.${reveal.responder_id}),and(user1_id.eq.${reveal.responder_id},user2_id.eq.${reveal.requester_id})`,
          );

        if (findError) {
          logger.error('Failed to find conversations for identity reveal', {
            error: findError,
            requesterId: reveal.requester_id,
            responderId: reveal.responder_id,
          });
        } else if (conversations && conversations.length > 0) {
          const conversationIds = conversations.map((c: any) => c.id);
          const { error: convUpdateError } = await this.admin
            .from('conversations')
            .update({
              user1_identity_revealed: true,
              user2_identity_revealed: true,
            })
            .in('id', conversationIds);

          if (convUpdateError) {
            logger.error('Failed to update conversation identity flags', {
              error: convUpdateError,
              conversationIds,
              requesterId: reveal.requester_id,
              responderId: reveal.responder_id,
            });
          } else {
            logger.info('Updated identity flags on conversations', {
              conversationCount: conversationIds.length,
              conversationIds,
              requesterId: reveal.requester_id,
              responderId: reveal.responder_id,
            });
          }
        } else {
          logger.warn(
            'No conversations found between users for identity reveal',
            {
              requesterId: reveal.requester_id,
              responderId: reveal.responder_id,
            },
          );
        }
      }

      // Send in-app notification and email
      try {
        const [{ data: requester }, { data: responder }] = await Promise.all([
          this.admin
            .from('user_profiles')
            .select('email, username, email_notifications')
            .eq('id', reveal.requester_id)
            .single(),
          this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single(),
        ]);

        // Create in-app notification
        const isAccepted = dto.action === 'accept';
        await this.notificationsService.createNotification({
          user_id: reveal.requester_id,
          actor_id: userId,
          type: isAccepted ? 'identity_reveal' : 'identity_reveal_rejected',
          title: isAccepted ? 'Identity Revealed' : 'Identity Reveal Declined',
          message: isAccepted
            ? `${responder?.username || 'Someone'} accepted your identity reveal request`
            : `${responder?.username || 'Someone'} declined your identity reveal request`,
          action_url: `/messages/identity-reveals/${dto.reveal_id}`,
          reference_id: dto.reveal_id,
          reference_type: 'identity_reveal',
          delivery_method: ['in_app'],
        });

        // Send email notification for acceptance (respects emailNotifications setting)
        if (
          isAccepted &&
          requester?.email &&
          requester.email_notifications !== false
        ) {
          await this.emailService.sendIdentityRevealAcceptedEmail(
            requester.email,
            requester.username,
            reveal.id || '',
          );
        }
      } catch (notifyError) {
        logger.warn('Failed to send response notification', { notifyError });
      }

      return {
        success: true,
        data: {
          reveal_id: updatedReveal.id,
          status: updatedReveal.status,
          responded_at: updatedReveal.responded_at,
        },
        message: `Identity reveal request ${dto.action}ed`,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to respond to identity reveal', { error, userId });
      throw new BadRequestException('Failed to respond to identity reveal');
    }
  }

  async cancelReveal(userId: string, revealId: string) {
    logger.info('Cancelling identity reveal', { userId, revealId });

    try {
      const { data: reveal, error } = await this.admin
        .from('identity_reveals')
        .select('id, status, requester_id')
        .eq('id', revealId)
        .single();

      if (error || !reveal)
        throw new NotFoundException('Identity reveal request not found');

      if (reveal.requester_id !== userId) {
        throw new ForbiddenException(
          'Only the requester can cancel a reveal request',
        );
      }

      if (reveal.status !== 'pending') {
        throw new BadRequestException('Only pending requests can be cancelled');
      }

      await this.admin
        .from('identity_reveals')
        .update({ status: 'cancelled', responded_at: new Date().toISOString() })
        .eq('id', revealId);

      return {
        success: true,
        message: 'Identity reveal request cancelled',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to cancel identity reveal', { error, userId });
      throw new BadRequestException('Failed to cancel identity reveal');
    }
  }

  async getReveals(userId: string, dto: GetIdentityRevealsDto) {
    try {
      let query = this.admin
        .from('identity_reveals')
        .select(
          `
          *,
          requester:user_profiles!requester_id(username, avatar),
          responder:user_profiles!responder_id(username, avatar),
          connection:referral_connections(conversation_id)
        `,
        )
        .or(`requester_id.eq.${userId},responder_id.eq.${userId}`);

      if (dto.status !== 'all') {
        query = query.eq('status', dto.status);
      }

      const { data: reveals, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) throw error;

      const transformed = reveals.map((reveal: any) => ({
        id: reveal.id,
        connection_id: reveal.connection_id,
        conversation_id: reveal.connection?.conversation_id,
        requester_id: reveal.requester_id,
        responder_id: reveal.responder_id,
        status: reveal.status,
        requester_message: reveal.requester_message_encrypted
          ? this.encryption.decrypt(reveal.requester_message_encrypted)
          : null,
        created_at: reveal.created_at,
        updated_at: reveal.updated_at,
        responded_at: reveal.responded_at,
        requester: {
          id: reveal.requester_id,
          username:
            reveal.status === 'accepted'
              ? reveal.requester.username
              : 'Anonymous User',
          avatar: reveal.requester.avatar,
        },
        responder: {
          id: reveal.responder_id,
          username:
            reveal.status === 'accepted'
              ? reveal.responder.username
              : 'Anonymous User',
          avatar: reveal.responder.avatar,
        },
      }));

      return {
        success: true,
        data: {
          reveals: transformed,
          total: transformed.length,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch identity reveals', { error, userId });
      throw new BadRequestException('Failed to fetch identity reveals');
    }
  }

  async getRevealStatus(userId: string, conversationId: string) {
    try {
      // Get conversation details including identity revealed fields
      const { data: conversation } = await this.admin
        .from('conversations')
        .select(
          'user1_id, user2_id, user1_identity_revealed, user2_identity_revealed',
        )
        .eq('id', conversationId)
        .single();

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (
        conversation.user1_id !== userId &&
        conversation.user2_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this conversation');
      }

      const otherUserId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      // Get any pending reveal requests (check BOTH directions)
      const { data: pendingReveal } = await this.admin
        .from('identity_reveals')
        .select('id, status, requester_id, responder_id')
        .or(
          `and(requester_id.eq.${userId},responder_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},responder_id.eq.${userId})`,
        )
        .eq('status', 'pending')
        .maybeSingle();

      const isRevealed =
        conversation.user1_id === userId
          ? conversation.user1_identity_revealed
          : conversation.user2_identity_revealed;

      return {
        success: true,
        data: {
          identity_revealed: isRevealed,
          pending_request: pendingReveal
            ? {
                id: pendingReveal.id,
                status: pendingReveal.status,
                direction:
                  pendingReveal.requester_id === userId ? 'sent' : 'received',
              }
            : null,
          can_request: !isRevealed && !pendingReveal,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      logger.error('Failed to get reveal status', { error, userId });
      throw new BadRequestException('Failed to get reveal status');
    }
  }
}
