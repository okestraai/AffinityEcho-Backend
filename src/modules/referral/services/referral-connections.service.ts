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
import {
  SendConnectionRequestDto,
  UpdateConnectionProgressDto,
  AddConnectionNotesDto,
} from '../dto/connection.dto';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class ReferralConnectionsService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async getUserConnections(userId: string, status?: string, type?: string) {
    logger.info('Fetching user connections', { userId, status, type });

    try {
      let sentQuery = this.admin
        .from('referral_connections')
        .select('*, referral_posts(*), receiver:user_profiles!receiver_id(*)')
        .eq('sender_id', userId);

      let receivedQuery = this.admin
        .from('referral_connections')
        .select('*, referral_posts(*), sender:user_profiles!sender_id(*)')
        .eq('receiver_id', userId);

      if (status && status !== 'all') {
        sentQuery = sentQuery.eq('status', status);
        receivedQuery = receivedQuery.eq('status', status);
      }

      const [sentResult, receivedResult] = await Promise.all([
        sentQuery,
        receivedQuery,
      ]);

      if (sentResult.error) throw sentResult.error;
      if (receivedResult.error) throw receivedResult.error;

      // Decrypt sensitive data
      const transformConnection = (conn: any, isSent: boolean) => {
        const other = isSent ? conn.receiver : conn.sender;
        const isIdentityRevealed = conn.identity_revealed;

        return {
          id: conn.id,
          referralPostId: conn.referral_post_id,
          senderId: conn.sender_id,
          receiverId: conn.receiver_id,
          status: conn.status,
          message: conn.message_encrypted
            ? this.encryption.decrypt(conn.message_encrypted)
            : null,
          identityRevealed: isIdentityRevealed,
          referralSubmitted: conn.referral_submitted,
          interviewScheduled: conn.interview_scheduled,
          offerReceived: conn.offer_received,
          outcomeNotes: conn.outcome_notes,
          createdAt: conn.created_at,
          updatedAt: conn.updated_at,
          respondedAt: conn.responded_at,
          referralPost: conn.referral_posts
            ? {
                id: conn.referral_posts.id,
                title: this.encryption.decrypt(
                  conn.referral_posts.title_encrypted,
                ),
                company: this.encryption.decrypt(
                  conn.referral_posts.company_encrypted,
                ),
                type: conn.referral_posts.type,
                status: conn.referral_posts.status,
              }
            : null,
          otherUser: isIdentityRevealed
            ? {
                id: other.id,
                username: other.username,
                avatar: other.avatar,
                jobTitle: other.job_title,
                company: other.company,
                bio: other.bio,
              }
            : {
                id: other.id,
                username: 'Anonymous User',
                avatar: '👤',
              },
          notes: isSent
            ? conn.sender_notes_encrypted
              ? this.encryption.decrypt(conn.sender_notes_encrypted)
              : null
            : conn.receiver_notes_encrypted
              ? this.encryption.decrypt(conn.receiver_notes_encrypted)
              : null,
        };
      };

      const sent = sentResult.data.map((c) => transformConnection(c, true));
      const received = receivedResult.data.map((c) =>
        transformConnection(c, false),
      );

      if (type === 'sent') {
        return { success: true, data: { sent } };
      } else if (type === 'received') {
        return { success: true, data: { received } };
      }

      return { success: true, data: { sent, received } };
    } catch (error) {
      logger.error('Failed to fetch connections', { error });
      throw new BadRequestException('Failed to fetch connections');
    }
  }

  async getConnectionById(userId: string, connectionId: string) {
    logger.info('Fetching connection by ID', { userId, connectionId });

    try {
      const { data, error } = await this.admin
        .from('referral_connections')
        .select(
          '*, referral_posts(*), sender:user_profiles!sender_id(*), receiver:user_profiles!receiver_id(*)',
        )
        .eq('id', connectionId)
        .single();

      if (error || !data) throw new NotFoundException('Connection not found');

      // Verify user is part of this connection
      if (data.sender_id !== userId && data.receiver_id !== userId) {
        throw new ForbiddenException('Not authorized to view this connection');
      }

      const isSender = data.sender_id === userId;
      const isIdentityRevealed = data.identity_revealed;

      return {
        success: true,
        data: {
          id: data.id,
          referralPostId: data.referral_post_id,
          status: data.status,
          message: data.message_encrypted
            ? this.encryption.decrypt(data.message_encrypted)
            : null,
          identityRevealed: isIdentityRevealed,
          referralSubmitted: data.referral_submitted,
          interviewScheduled: data.interview_scheduled,
          offerReceived: data.offer_received,
          outcomeNotes: data.outcome_notes,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          respondedAt: data.responded_at,
          referralPost: {
            id: data.referral_posts.id,
            title: this.encryption.decrypt(data.referral_posts.title_encrypted),
            company: this.encryption.decrypt(
              data.referral_posts.company_encrypted,
            ),
            jobTitle: data.referral_posts.job_title_encrypted
              ? this.encryption.decrypt(data.referral_posts.job_title_encrypted)
              : null,
          },
          sender: isIdentityRevealed
            ? data.sender
            : { id: data.sender.id, username: 'Anonymous User', avatar: '👤' },
          receiver: isIdentityRevealed
            ? data.receiver
            : {
                id: data.receiver.id,
                username: 'Anonymous User',
                avatar: '👤',
              },
          myNotes: isSender
            ? data.sender_notes_encrypted
              ? this.encryption.decrypt(data.sender_notes_encrypted)
              : null
            : data.receiver_notes_encrypted
              ? this.encryption.decrypt(data.receiver_notes_encrypted)
              : null,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error('Failed to fetch connection', { error });
      throw new BadRequestException('Failed to fetch connection');
    }
  }

  async sendConnectionRequest(
    userId: string,
    referralId: string,
    dto: SendConnectionRequestDto,
  ) {
    logger.info('Sending connection request', { userId, referralId });

    try {
      // Get referral post to find receiver
      const { data: post, error: postError } = await this.admin
        .from('referral_posts')
        .select('user_id, status, available_slots')
        .eq('id', referralId)
        .single();

      if (postError || !post)
        throw new NotFoundException('Referral post not found');

      if (post.user_id === userId) {
        throw new BadRequestException(
          'Cannot send connection request to your own post',
        );
      }

      if (post.status !== 'open') {
        throw new BadRequestException('This referral is no longer open');
      }

      // Check if connection already exists
      const { data: existing } = await this.admin
        .from('referral_connections')
        .select('id')
        .eq('referral_post_id', referralId)
        .eq('sender_id', userId)
        .eq('receiver_id', post.user_id)
        .maybeSingle();

      if (existing) {
        throw new BadRequestException(
          'You already have a connection request for this referral',
        );
      }

      // Create connection
      const connectionData = {
        referral_post_id: referralId,
        sender_id: userId,
        receiver_id: post.user_id,
        status: 'pending',
        message_encrypted: dto.message
          ? this.encryption.encrypt(dto.message)
          : null,
        identity_revealed: false,
      };

      const { data, error } = await this.admin
        .from('referral_connections')
        .insert([connectionData])
        .select()
        .single();

      if (error) throw error;

      // Increment connection requests count
      await this.admin.rpc('increment_connection_requests', {
        referral_id: referralId,
      });

      // Create in-app notification and send email
      try {
        const [{ data: receiver }, { data: sender }] = await Promise.all([
          this.admin
            .from('user_profiles')
            .select('email, username')
            .eq('id', post.user_id)
            .single(),
          this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single(),
        ]);

        // Create in-app notification
        await this.notificationsService.createNotification({
          user_id: post.user_id,
          actor_id: userId,
          type: 'referral_connection',
          title: 'New Connection Request',
          message: `${sender?.username || 'Someone'} sent you a connection request for your referral`,
          action_url: `/referral/connections/${data.id}`,
          reference_id: data.id,
          reference_type: 'referral_connection',
          metadata: { referral_post_id: referralId },
          delivery_method: ['in_app'],
        });

        // Send email notification
        if (receiver?.email) {
          await this.emailService.sendConnectionRequestEmail(
            receiver.email,
            receiver.username,
            referralId,
          );
        }
      } catch (emailError) {
        logger.warn('Failed to send connection request email', { emailError });
      }

      return {
        success: true,
        data: {
          id: data.id,
          status: data.status,
          createdAt: data.created_at,
        },
        message: 'Connection request sent successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to send connection request', { error });
      throw new BadRequestException('Failed to send connection request');
    }
  }

  async acceptConnection(userId: string, connectionId: string) {
    logger.info('Accepting connection', { userId, connectionId });

    try {
      const { data: connection, error: fetchError } = await this.admin
        .from('referral_connections')
        .select('*, referral_posts(*)')
        .eq('id', connectionId)
        .single();

      if (fetchError || !connection)
        throw new NotFoundException('Connection not found');

      if (connection.receiver_id !== userId) {
        throw new ForbiddenException(
          'Not authorized to accept this connection',
        );
      }

      if (connection.status !== 'pending') {
        throw new BadRequestException('Connection is not pending');
      }

      const { data, error } = await this.admin
        .from('referral_connections')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .select()
        .single();

      if (error) throw error;

      // Update available slots if it's an offer
      if (
        connection.referral_posts.type === 'offer' &&
        connection.referral_posts.available_slots !== null &&
        connection.referral_posts.available_slots > 0
      ) {
        await this.admin.rpc('decrement_available_slots', {
          referral_id: connection.referral_post_id,
        });
      }

      // Send in-app notification and email
      try {
        const [{ data: sender }, { data: receiver }] = await Promise.all([
          this.admin
            .from('user_profiles')
            .select('email, username')
            .eq('id', connection.sender_id)
            .single(),
          this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single(),
        ]);

        // Create in-app notification
        await this.notificationsService.createNotification({
          user_id: connection.sender_id,
          actor_id: userId,
          type: 'referral_connection',
          title: 'Connection Accepted',
          message: `${receiver?.username || 'Someone'} accepted your connection request`,
          action_url: `/referral/connections/${connectionId}`,
          reference_id: connectionId,
          reference_type: 'referral_connection',
          metadata: { status: 'accepted', referral_post_id: connection.referral_post_id },
          delivery_method: ['in_app'],
        });

        // Send email notification
        if (sender?.email) {
          await this.emailService.sendConnectionAcceptedEmail(
            sender.email,
            sender.username,
            connection.referral_post_id,
          );
        }
      } catch (emailError) {
        logger.warn('Failed to send acceptance email', { emailError });
      }

      return {
        success: true,
        data: { id: data.id, status: data.status },
        message: 'Connection accepted successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to accept connection', { error });
      throw new BadRequestException('Failed to accept connection');
    }
  }

  async rejectConnection(userId: string, connectionId: string) {
    logger.info('Rejecting connection', { userId, connectionId });

    try {
      const { data: connection } = await this.admin
        .from('referral_connections')
        .select('receiver_id, sender_id, status')
        .eq('id', connectionId)
        .single();

      if (!connection) throw new NotFoundException('Connection not found');

      if (connection.receiver_id !== userId) {
        throw new ForbiddenException(
          'Not authorized to reject this connection',
        );
      }

      if (connection.status !== 'pending') {
        throw new BadRequestException('Connection is not pending');
      }

      const { data, error } = await this.admin
        .from('referral_connections')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: { id: data.id, status: data.status },
        message: 'Connection rejected',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to reject connection', { error });
      throw new BadRequestException('Failed to reject connection');
    }
  }

  async updateProgress(
    userId: string,
    connectionId: string,
    dto: UpdateConnectionProgressDto,
  ) {
    logger.info('Updating connection progress', { userId, connectionId });

    try {
      const { data: connection } = await this.admin
        .from('referral_connections')
        .select('sender_id, receiver_id, status')
        .eq('id', connectionId)
        .single();

      if (!connection) throw new NotFoundException('Connection not found');

      if (
        connection.sender_id !== userId &&
        connection.receiver_id !== userId
      ) {
        throw new ForbiddenException(
          'Not authorized to update this connection',
        );
      }

      if (connection.status !== 'accepted') {
        throw new BadRequestException(
          'Can only update progress on accepted connections',
        );
      }

      const updateData: any = { updated_at: new Date().toISOString() };

      if (dto.referralSubmitted !== undefined)
        updateData.referral_submitted = dto.referralSubmitted;
      if (dto.interviewScheduled !== undefined)
        updateData.interview_scheduled = dto.interviewScheduled;
      if (dto.offerReceived !== undefined)
        updateData.offer_received = dto.offerReceived;
      if (dto.outcomeNotes !== undefined)
        updateData.outcome_notes = dto.outcomeNotes;

      const { data, error } = await this.admin
        .from('referral_connections')
        .update(updateData)
        .eq('id', connectionId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: {
          id: data.id,
          referralSubmitted: data.referral_submitted,
          interviewScheduled: data.interview_scheduled,
          offerReceived: data.offer_received,
        },
        message: 'Progress updated successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to update progress', { error });
      throw new BadRequestException('Failed to update progress');
    }
  }

  async addNotes(
    userId: string,
    connectionId: string,
    dto: AddConnectionNotesDto,
  ) {
    logger.info('Adding connection notes', { userId, connectionId });

    try {
      const { data: connection } = await this.admin
        .from('referral_connections')
        .select('sender_id, receiver_id')
        .eq('id', connectionId)
        .single();

      if (!connection) throw new NotFoundException('Connection not found');

      const isSender = connection.sender_id === userId;
      const isReceiver = connection.receiver_id === userId;

      if (!isSender && !isReceiver) {
        throw new ForbiddenException('Not authorized to add notes');
      }

      const updateData: any = {};

      if (dto.noteType === 'sender' && isSender) {
        updateData.sender_notes_encrypted = this.encryption.encrypt(dto.notes);
      } else if (dto.noteType === 'receiver' && isReceiver) {
        updateData.receiver_notes_encrypted = this.encryption.encrypt(
          dto.notes,
        );
      } else {
        throw new BadRequestException('Invalid note type for your role');
      }

      const { data, error } = await this.admin
        .from('referral_connections')
        .update(updateData)
        .eq('id', connectionId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: { id: data.id },
        message: 'Notes added successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Failed to add notes', { error });
      throw new BadRequestException('Failed to add notes');
    }
  }
}
