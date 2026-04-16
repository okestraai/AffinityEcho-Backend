import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { CreateSessionDto } from '../dto/create-session.dto';
import { UpdateSessionDto } from '../dto/update-session.dto';
import { SessionStatusDto } from '../dto/session-status.dto';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class MentorshipSessionsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async createSession(relationshipId: string, dto: CreateSessionDto) {
    try {
      // Check if relationship exists and is active
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status, total_sessions')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      if (!['accepted', 'active'].includes(relationship.status)) {
        throw new BadRequestException(
          `Cannot create session for a ${relationship.status} relationship`,
        );
      }

      // Create the session
      const { data: session, error } = await this.admin
        .from('mentorship_sessions')
        .insert({
          relationship_id: relationshipId,
          scheduled_at: dto.scheduledAt,
          duration_minutes: dto.durationMinutes,
          meeting_url: dto.meetingUrl,
          agenda_encrypted: dto.agenda,
          status: 'scheduled',
        })
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to create session');
      }

      // Update relationship's next session and increment total sessions
      const newTotalSessions = (relationship.total_sessions || 0) + 1;
      await this.admin
        .from('mentorship_relationships')
        .update({
          next_session_at: dto.scheduledAt,
          total_sessions: newTotalSessions,
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationshipId);

      // Create notifications for both parties
      const notificationMessage = `New session scheduled for ${new Date(dto.scheduledAt).toLocaleDateString()}`;

      await Promise.all([
        this.createNotification(
          relationship.mentor_id,
          relationship.mentee_id,
          'session_scheduled',
          'Session Scheduled',
          notificationMessage,
          `/mentorship/sessions/${session.id}`,
          session.id,
          'mentorship_session',
        ),
        this.createNotification(
          relationship.mentee_id,
          relationship.mentor_id,
          'session_scheduled',
          'Session Scheduled',
          notificationMessage,
          `/mentorship/sessions/${session.id}`,
          session.id,
          'mentorship_session',
        ),
      ]);

      return {
        message: MSG.MENTORSHIP.SESSION_CREATED,
        session,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to create session');
    }
  }

  async getSessions(relationshipId: string) {
    try {
      const { data: sessions, error } = await this.admin
        .from('mentorship_sessions')
        .select('*')
        .eq('relationship_id', relationshipId)
        .order('scheduled_at', { ascending: false });

      if (error) {
        throw new BadRequestException('Failed to retrieve sessions');
      }

      return sessions || [];
    } catch (error) {
      throw new BadRequestException('Failed to retrieve sessions');
    }
  }

  async getSession(sessionId: string) {
    try {
      const { data: session, error } = await this.admin
        .from('mentorship_sessions')
        .select(
          `
          *,
          relationship:mentorship_relationships(
            id,
            mentor_id,
            mentee_id,
            status,
            mentor:user_profiles!mentor_relationships(
              id,
              username,
              avatar,
              is_company_verified
            ),
            mentee:user_profiles!mentee_relationships(
              id,
              username,
              avatar,
              is_company_verified
            )
          )
        `,
        )
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        throw new NotFoundException(MSG.MENTORSHIP.SESSION_NOT_FOUND);
      }

      return session;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve session');
    }
  }

  async updateSession(sessionId: string, dto: UpdateSessionDto) {
    try {
      // Get current session
      const { data: currentSession } = await this.admin
        .from('mentorship_sessions')
        .select('relationship_id, status')
        .eq('id', sessionId)
        .single();

      if (!currentSession) {
        throw new NotFoundException(MSG.MENTORSHIP.SESSION_NOT_FOUND);
      }

      if (currentSession.status === 'completed') {
        throw new BadRequestException('Cannot update a completed session');
      }

      const updateData: any = {
        ...dto,
        updated_at: new Date().toISOString(),
      };

      // If scheduled_at is updated, update relationship's next_session_at
      if (dto.scheduledAt) {
        await this.admin
          .from('mentorship_relationships')
          .update({
            next_session_at: dto.scheduledAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentSession.relationship_id);
      }

      const { data: updatedSession, error } = await this.admin
        .from('mentorship_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to update session');
      }

      return {
        message: MSG.MENTORSHIP.SESSION_UPDATED,
        session: updatedSession,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update session');
    }
  }

  async updateSessionStatus(
    sessionId: string,
    userId: string,
    statusDto: SessionStatusDto,
  ) {
    try {
      const { action, ...data } = statusDto;

      switch (action) {
        case 'complete':
          return this.completeSession(sessionId, userId, data);
        case 'cancel':
          return this.cancelSession(sessionId, userId, data.reason);
        case 'reschedule':
          // Check if scheduledAt is provided
          if (!data.scheduledAt) {
            throw new BadRequestException(
              'scheduledAt is required for reschedule action',
            );
          }
          return this.rescheduleSession(sessionId, userId, data.scheduledAt);
        default:
          throw new BadRequestException('Invalid action');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update session status');
    }
  }

  private async completeSession(
    sessionId: string,
    userId: string,
    completionData: any,
  ) {
    try {
      const { data: session } = await this.admin
        .from('mentorship_sessions')
        .select('relationship_id, status')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new NotFoundException(MSG.MENTORSHIP.SESSION_NOT_FOUND);
      }

      if (session.status !== 'scheduled') {
        throw new BadRequestException(
          `Cannot complete a ${session.status} session`,
        );
      }

      // Get relationship to check user role
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, completed_sessions')
        .eq('id', session.relationship_id)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      const isMentor = relationship.mentor_id === userId;
      const isMentee = relationship.mentee_id === userId;

      if (!isMentor && !isMentee) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      const updateData: any = {
        status: 'completed',
        session_notes_encrypted: completionData.sessionNotes,
        updated_at: new Date().toISOString(),
      };

      // Update role-specific notes and ratings
      if (isMentor) {
        updateData.mentor_notes_encrypted = completionData.mentorNotes;
        updateData.mentor_rating = completionData.rating;
        updateData.mentor_feedback = completionData.feedback;
      } else if (isMentee) {
        updateData.mentee_notes_encrypted = completionData.menteeNotes;
        updateData.mentee_rating = completionData.rating;
        updateData.mentee_feedback = completionData.feedback;
      }

      const { data: updatedSession, error } = await this.admin
        .from('mentorship_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to complete session');
      }

      // Update relationship stats
      const newCompletedSessions = (relationship.completed_sessions || 0) + 1;
      await this.admin
        .from('mentorship_relationships')
        .update({
          completed_sessions: newCompletedSessions,
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.relationship_id);

      return {
        message: MSG.MENTORSHIP.SESSION_COMPLETED,
        session: updatedSession,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to complete session');
    }
  }

  private async cancelSession(
    sessionId: string,
    userId: string,
    reason?: string,
  ) {
    try {
      const { data: session } = await this.admin
        .from('mentorship_sessions')
        .select('relationship_id, status')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new NotFoundException(MSG.MENTORSHIP.SESSION_NOT_FOUND);
      }

      if (session.status === 'completed') {
        throw new BadRequestException('Cannot cancel a completed session');
      }

      // Get relationship to check user role
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id')
        .eq('id', session.relationship_id)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      const isMentor = relationship.mentor_id === userId;
      const isMentee = relationship.mentee_id === userId;

      if (!isMentor && !isMentee) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      const { data: updatedSession, error } = await this.admin
        .from('mentorship_sessions')
        .update({
          status: 'cancelled',
          session_notes_encrypted: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to cancel session');
      }

      // Update relationship's next session
      await this.admin
        .from('mentorship_relationships')
        .update({
          next_session_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.relationship_id);

      // Create notification for the other party
      const otherUserId = isMentor
        ? relationship.mentee_id
        : relationship.mentor_id;
      await this.createNotification(
        otherUserId,
        userId,
        'session_cancelled',
        'Session Cancelled',
        `Session has been cancelled${reason ? `: ${reason}` : ''}`,
        `/mentorship/sessions/${sessionId}`,
        sessionId,
        'mentorship_session',
      );

      return {
        message: MSG.MENTORSHIP.SESSION_CANCELLED,
        session: updatedSession,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to cancel session');
    }
  }

  private async rescheduleSession(
    sessionId: string,
    userId: string,
    scheduledAt: string, // Changed from string | undefined to string
  ) {
    try {
      const { data: session } = await this.admin
        .from('mentorship_sessions')
        .select('relationship_id, status')
        .eq('id', sessionId)
        .single();

      if (!session) {
        throw new NotFoundException(MSG.MENTORSHIP.SESSION_NOT_FOUND);
      }

      if (session.status === 'completed') {
        throw new BadRequestException('Cannot reschedule a completed session');
      }

      // Get relationship to check user role
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id')
        .eq('id', session.relationship_id)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      const isMentor = relationship.mentor_id === userId;
      const isMentee = relationship.mentee_id === userId;

      if (!isMentor && !isMentee) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      const { data: updatedSession, error } = await this.admin
        .from('mentorship_sessions')
        .update({
          scheduled_at: scheduledAt,
          status: 'scheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw new BadRequestException('Failed to reschedule session');
      }

      // Update relationship's next session
      await this.admin
        .from('mentorship_relationships')
        .update({
          next_session_at: scheduledAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.relationship_id);

      // Create notification for the other party
      const otherUserId = isMentor
        ? relationship.mentee_id
        : relationship.mentor_id;
      await this.createNotification(
        otherUserId,
        userId,
        'session_rescheduled',
        'Session Rescheduled',
        `Session has been rescheduled to ${new Date(scheduledAt).toLocaleDateString()}`,
        `/mentorship/sessions/${sessionId}`,
        sessionId,
        'mentorship_session',
      );

      return {
        message: MSG.MENTORSHIP.SESSION_RESCHEDULED,
        session: updatedSession,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to reschedule session');
    }
  }

  private async createNotification(
    userId: string,
    actorId: string,
    type: string,
    title: string,
    message: string,
    actionUrl: string | null,
    referenceId: string,
    referenceType: string,
  ) {
    try {
      await this.admin.from('notifications').insert({
        user_id: userId,
        actor_id: actorId,
        type,
        title,
        message,
        action_url: actionUrl,
        reference_id: referenceId,
        reference_type: referenceType,
        metadata: {},
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  }
}
