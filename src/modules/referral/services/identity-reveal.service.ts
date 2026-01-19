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
import logger from '../../../common/utils/logger.util';
import { RequestIdentityRevealDto } from '../dto/identity-reveal.dto';

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

  async getUserReveals(userId: string, status?: string) {
    logger.info('Fetching identity reveal requests', { userId, status });

    try {
      let query = this.admin
        .from('identity_reveals')
        .select(
          '*, connection:referral_connections(*), requester:user_profiles!requester_id(*), responder:user_profiles!responder_id(*)',
        )
        .or(`requester_id.eq.${userId},responder_id.eq.${userId}`);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) throw error;

      const transformed = data.map((reveal) => ({
        id: reveal.id,
        connectionId: reveal.connection_id,
        requesterId: reveal.requester_id,
        responderId: reveal.responder_id,
        status: reveal.status,
        requesterMessage: reveal.requester_message_encrypted
          ? this.encryption.decrypt(reveal.requester_message_encrypted)
          : null,
        createdAt: reveal.created_at,
        updatedAt: reveal.updated_at,
        respondedAt: reveal.responded_at,
        requester: {
          id: reveal.requester.id,
          username:
            reveal.status === 'accepted'
              ? reveal.requester.username
              : 'Anonymous User',
          avatar: reveal.requester.avatar,
        },
        responder: {
          id: reveal.responder.id,
          username:
            reveal.status === 'accepted'
              ? reveal.responder.username
              : 'Anonymous User',
          avatar: reveal.responder.avatar,
        },
      }));

      return { success: true, data: transformed };
    } catch (error) {
      logger.error('Failed to fetch identity reveals', { error });
      throw new BadRequestException('Failed to fetch identity reveals');
    }
  }

  async requestReveal(
    userId: string,
    connectionId: string,
    dto: RequestIdentityRevealDto,
  ) {
    logger.info('Requesting identity reveal', { userId, connectionId });

    try {
      const { data: connection, error: connError } = await this.admin
        .from('referral_connections')
        .select('*')
        .eq('id', connectionId)
        .single();

      if (connError || !connection)
        throw new NotFoundException('Connection not found');

      if (
        connection.sender_id !== userId &&
        connection.receiver_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this connection');
      }

      if (connection.status !== 'accepted') {
        throw new BadRequestException(
          'Identity reveal only available for accepted connections',
        );
      }

      if (connection.identity_revealed) {
        throw new BadRequestException('Identity already revealed');
      }

      // Check if request already exists
      const { data: existing } = await this.admin
        .from('identity_reveals')
        .select('id, status')
        .eq('connection_id', connectionId)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'pending') {
          throw new BadRequestException(
            'Identity reveal request already pending',
          );
        }
        if (existing.status === 'accepted') {
          throw new BadRequestException('Identity already revealed');
        }
      }

      const responderId =
        userId === connection.sender_id
          ? connection.receiver_id
          : connection.sender_id;

      const revealData = {
        connection_id: connectionId,
        requester_id: userId,
        responder_id: responderId,
        status: 'pending',
        requester_message_encrypted: dto.message
          ? this.encryption.encrypt(dto.message)
          : null,
      };

      const { data, error } = await this.admin
        .from('identity_reveals')
        .insert([revealData])
        .select()
        .single();

      if (error) throw error;

      // Send notification
      try {
        const { data: responder } = await this.admin
          .from('user_profiles')
          .select('email, username')
          .eq('id', responderId)
          .single();

        if (responder?.email) {
          await this.emailService.sendIdentityRevealRequestEmail(
            responder.email,
            responder.username,
            connectionId,
          );
        }
      } catch (emailError) {
        logger.warn('Failed to send identity reveal email', { emailError });
      }

      return {
        success: true,
        data: { id: data.id, status: data.status },
        message: 'Identity reveal request sent',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to request identity reveal', { error });
      throw new BadRequestException('Failed to request identity reveal');
    }
  }

  async acceptReveal(userId: string, revealId: string) {
    logger.info('Accepting identity reveal', { userId, revealId });

    try {
      const { data: reveal, error: revealError } = await this.admin
        .from('identity_reveals')
        .select('*')
        .eq('id', revealId)
        .single();

      if (revealError || !reveal)
        throw new NotFoundException('Reveal request not found');

      if (reveal.responder_id !== userId) {
        throw new ForbiddenException('Not authorized to accept this request');
      }

      if (reveal.status !== 'pending') {
        throw new BadRequestException('Request is not pending');
      }

      // Update reveal status
      const { error: updateRevealError } = await this.admin
        .from('identity_reveals')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', revealId);

      if (updateRevealError) throw updateRevealError;

      // Update connection to reveal identity
      const { data: connection, error: updateConnError } = await this.admin
        .from('referral_connections')
        .update({ identity_revealed: true })
        .eq('id', reveal.connection_id)
        .select()
        .single();

      if (updateConnError) throw updateConnError;

      // Send notification
      try {
        const { data: requester } = await this.admin
          .from('user_profiles')
          .select('email, username')
          .eq('id', reveal.requester_id)
          .single();

        if (requester?.email) {
          await this.emailService.sendIdentityRevealAcceptedEmail(
            requester.email,
            requester.username,
            reveal.connection_id,
          );
        }
      } catch (emailError) {
        logger.warn('Failed to send acceptance email', { emailError });
      }

      return {
        success: true,
        data: {
          id: revealId,
          status: 'accepted',
          connection: { identityRevealed: true },
        },
        message: 'Identity revealed successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to accept identity reveal', { error });
      throw new BadRequestException('Failed to accept identity reveal');
    }
  }

  async rejectReveal(userId: string, revealId: string) {
    logger.info('Rejecting identity reveal', { userId, revealId });

    try {
      const { data: reveal } = await this.admin
        .from('identity_reveals')
        .select('*')
        .eq('id', revealId)
        .single();

      if (!reveal) throw new NotFoundException('Reveal request not found');

      if (reveal.responder_id !== userId) {
        throw new ForbiddenException('Not authorized to reject this request');
      }

      if (reveal.status !== 'pending') {
        throw new BadRequestException('Request is not pending');
      }

      const { data, error } = await this.admin
        .from('identity_reveals')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString(),
        })
        .eq('id', revealId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: { id: data.id, status: data.status },
        message: 'Identity reveal request rejected',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to reject identity reveal', { error });
      throw new BadRequestException('Failed to reject identity reveal');
    }
  }
}
