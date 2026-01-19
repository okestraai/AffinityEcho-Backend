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

@Injectable()
export class IdentityRevealService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
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

      // Check for existing pending request
      const { data: existingRequest } = await this.admin
        .from('identity_reveals')
        .select('id, status')
        .eq('requester_id', userId)
        .eq('responder_id', otherUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingRequest) {
        throw new BadRequestException(
          'Identity reveal request already pending',
        );
      }

      // Create identity reveal request
      const revealData = {
        connection_id: dto.connection_id,
        requester_id: userId,
        responder_id: otherUserId,
        status: 'pending',
        requester_message_encrypted: dto.message
          ? this.encryption.encrypt(dto.message)
          : null,
      };

      const { data: reveal, error: revealError } = await this.admin
        .from('identity_reveals')
        .insert([revealData])
        .select()
        .single();

      if (revealError) throw revealError;

      // Send notification email
      try {
        const { data: responder } = await this.admin
          .from('user_profiles')
          .select('email, username')
          .eq('id', otherUserId)
          .single();

        if (responder?.email) {
          await this.emailService.sendIdentityRevealRequestEmail(
            responder.email,
            responder.username,
            conversation.id,
          );
        }
      } catch (emailError) {
        logger.warn('Failed to send identity reveal email', { emailError });
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
    logger.info('Responding to identity reveal', {
      userId,
      revealId: dto.reveal_id,
    });

    try {
      // Get reveal request
      const { data: reveal, error: revealError } = await this.admin
        .from('identity_reveals')
        .select('*, connection:referral_connections(conversation_id)')
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

      // If accepted, update conversation identity revealed status
      if (dto.action === 'accept') {
        // Get conversation from connection or create one
        let conversationId = reveal.connection?.conversation_id;

        if (!conversationId) {
          // Find or create conversation between users
          const { data: conversation } = await this.admin
            .from('conversations')
            .select('id')
            .or(
              `and(user1_id.eq.${reveal.requester_id},user2_id.eq.${reveal.responder_id}),and(user1_id.eq.${reveal.responder_id},user2_id.eq.${reveal.requester_id})`,
            )
            .maybeSingle();

          if (conversation) {
            conversationId = conversation.id;

            // Update conversation identity revealed flags
            await this.admin
              .from('conversations')
              .update({
                user1_identity_revealed: true,
                user2_identity_revealed: true,
              })
              .eq('id', conversationId);
          }
        }
      }

      // Send notification email
      try {
        const { data: requester } = await this.admin
          .from('user_profiles')
          .select('email, username')
          .eq('id', reveal.requester_id)
          .single();

        if (requester?.email) {
          if (dto.action === 'accept') {
            await this.emailService.sendIdentityRevealAcceptedEmail(
              requester.email,
              requester.username,
              reveal.id || '', // Pass reveal ID as connectionId
            );
          } else {
            // Create a simple notification method for rejection
            await this.sendRejectionNotification(
              requester.email,
              requester.username,
              dto.reason,
            );
          }
        }
      } catch (emailError) {
        logger.warn('Failed to send response email', { emailError });
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

      const transformed = reveals.map((reveal) => ({
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

      // Get any pending reveal requests
      const { data: pendingReveal } = await this.admin
        .from('identity_reveals')
        .select('id, status')
        .eq('requester_id', userId)
        .eq('responder_id', otherUserId)
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

  // Helper method for sending rejection notifications
  private async sendRejectionNotification(
    email: string,
    username: string,
    reason?: string,
  ) {
    // Implement your own notification logic here
    // For now, just log it
    logger.info('Sending rejection notification', {
      email,
      username,
      reason,
    });

    // You can implement email sending or other notification methods here
    // Example using a generic email method:
    // await this.emailService.sendGenericEmail(
    //   email,
    //   'Identity Reveal Request Rejected',
    //   `Your identity reveal request was rejected.${reason ? ` Reason: ${reason}` : ''}`
    // );
  }
}
