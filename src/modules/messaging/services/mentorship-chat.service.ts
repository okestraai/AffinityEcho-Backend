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
import logger from '../../../common/utils/logger.util';

@Injectable()
export class MentorshipChatService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async getMentorshipProfile(
    userId: string,
    targetUserId: string,
    relationshipId?: string,
  ) {
    try {
      // Get target user's mentorship profile
      const { data: profile, error: profileError } = await this.admin
        .from('user_profiles')
        .select(
          `
          id,
          username,
          avatar,
          first_name_encrypted,
          last_name_encrypted,
          mentor_bio,
          mentor_expertise,
          mentor_industries,
          mentor_availability,
          mentor_response_time,
          mentor_style,
          mentor_languages,
          mentoring_as,
          years_experience,
          skills,
          job_title,
          company_encrypted,
          career_level_encrypted,
          location,
          reputation_score,
          mentorship_sessions_completed,
          last_active_at
        `,
        )
        .eq('id', targetUserId)
        .single();

      if (profileError || !profile) {
        throw new NotFoundException('User profile not found');
      }

      // Decrypt encrypted fields
      let company = null;
      let careerLevel = null;

      if (profile.company_encrypted) {
        try {
          company = this.encryption.decrypt(profile.company_encrypted);
        } catch (e) {
          logger.warn('Failed to decrypt company', { userId, targetUserId });
        }
      }

      if (profile.career_level_encrypted) {
        try {
          careerLevel = this.encryption.decrypt(profile.career_level_encrypted);
        } catch (e) {
          logger.warn('Failed to decrypt career level', {
            userId,
            targetUserId,
          });
        }
      }

      // Get relationship info if provided
      let relationshipInfo = null;
      if (relationshipId) {
        const { data: relationship } = await this.admin
          .from('mentorship_relationships')
          .select(
            `
            id,
            status,
            mentor_id,
            mentee_id,
            started_at,
            completed_sessions,
            total_sessions,
            next_session_at,
            meeting_frequency,
            match_score,
            mentor_rating,
            mentee_rating
          `,
          )
          .eq('id', relationshipId)
          .single();

        if (relationship) {
          // Verify user is part of this relationship
          if (
            relationship.mentor_id !== userId &&
            relationship.mentee_id !== userId
          ) {
            throw new ForbiddenException(
              'Not authorized to view this relationship',
            );
          }

          relationshipInfo = {
            id: relationship.id,
            status: relationship.status,
            role: relationship.mentor_id === userId ? 'mentor' : 'mentee',
            started_at: relationship.started_at,
            completed_sessions: relationship.completed_sessions,
            total_sessions: relationship.total_sessions,
            next_session_at: relationship.next_session_at,
            meeting_frequency: relationship.meeting_frequency,
            match_score: relationship.match_score,
            mentor_rating: relationship.mentor_rating,
            mentee_rating: relationship.mentee_rating,
          };
        }
      }

      // Get upcoming sessions
      const { data: upcomingSessions } = await this.admin
        .from('mentorship_sessions')
        .select('id, scheduled_at, duration_minutes, agenda_encrypted, status')
        .eq('relationship_id', relationshipId)
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5);

      const sessions =
        upcomingSessions?.map((session: any) => ({
          id: session.id,
          scheduled_at: session.scheduled_at,
          duration_minutes: session.duration_minutes,
          agenda: session.agenda_encrypted
            ? this.encryption.decrypt(session.agenda_encrypted)
            : null,
          status: session.status,
        })) || [];

      // Check identity reveal status
      let canRevealIdentity = false;
      let identityRevealed = false;
      if (relationshipId) {
        const { data: conversation } = await this.admin
          .from('conversations')
          .select(
            'user1_id, user2_id, user1_identity_revealed, user2_identity_revealed',
          )
          .or(
            `and(user1_id.eq.${userId},user2_id.eq.${targetUserId}),and(user1_id.eq.${targetUserId},user2_id.eq.${userId})`,
          )
          .eq('context_type', 'mentorship')
          .eq('context_id', relationshipId)
          .maybeSingle();

        if (conversation) {
          const myRevealed =
            conversation.user1_id === userId
              ? conversation.user1_identity_revealed
              : conversation.user2_identity_revealed;
          const otherRevealed =
            conversation.user1_id === userId
              ? conversation.user2_identity_revealed
              : conversation.user1_identity_revealed;
          canRevealIdentity = !myRevealed;
          identityRevealed = !!otherRevealed;
        }
      }

      // Also check identity_reveals table for mutual reveal
      if (!identityRevealed) {
        const revealedIds = await this.identityReveal.getRevealedUserIds(
          userId,
          [targetUserId],
        );
        identityRevealed = revealedIds.has(targetUserId);
      }

      // Resolve display name
      let displayName = profile.username;
      if (identityRevealed) {
        const realName = this.identityReveal.decryptRealName(
          profile.first_name_encrypted,
          profile.last_name_encrypted,
        );
        if (realName) displayName = realName;
      }

      return {
        success: true,
        data: {
          profile: {
            id: profile.id,
            username: profile.username,
            display_name: displayName,
            avatar: profile.avatar,
            mentor_bio: profile.mentor_bio,
            mentor_expertise: profile.mentor_expertise,
            mentor_industries: profile.mentor_industries,
            mentor_availability: profile.mentor_availability,
            mentor_response_time: profile.mentor_response_time,
            mentor_style: profile.mentor_style,
            mentor_languages: profile.mentor_languages,
            mentoring_as: profile.mentoring_as,
            years_experience: profile.years_experience,
            skills: profile.skills,
            job_title: profile.job_title,
            company: company,
            career_level: careerLevel,
            location: profile.location,
            reputation_score: profile.reputation_score,
            mentorship_sessions_completed:
              profile.mentorship_sessions_completed,
            last_active: profile.last_active_at,
          },
          relationship_info: relationshipInfo,
          upcoming_sessions: sessions,
          can_reveal_identity: canRevealIdentity,
          is_online: this.isUserOnline(profile.last_active_at),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      logger.error('Failed to get mentorship profile', { error, userId });
      throw new BadRequestException('Failed to get mentorship profile');
    }
  }

  async scheduleSession(
    userId: string,
    relationshipId: string,
    sessionData: any,
  ) {
    try {
      // Verify relationship and user access
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException('Mentorship relationship not found');
      }

      if (
        relationship.mentor_id !== userId &&
        relationship.mentee_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this relationship');
      }

      if (relationship.status !== 'active') {
        throw new BadRequestException('Relationship is not active');
      }

      // Create session
      const sessionToCreate = {
        relationship_id: relationshipId,
        scheduled_at: sessionData.scheduled_at,
        duration_minutes: sessionData.duration_minutes,
        agenda_encrypted: sessionData.agenda
          ? this.encryption.encrypt(sessionData.agenda)
          : null,
        status: 'scheduled',
      };

      const { data: session, error } = await this.admin
        .from('mentorship_sessions')
        .insert([sessionToCreate])
        .select()
        .single();

      if (error) throw error;

      // Update relationship's next session if this is the earliest
      await this.admin
        .from('mentorship_relationships')
        .update({
          next_session_at: sessionData.scheduled_at,
          last_contact_at: new Date().toISOString(),
        })
        .eq('id', relationshipId)
        .or(
          `next_session_at.is.null,next_session_at.gt.${sessionData.scheduled_at}`,
        );

      return {
        success: true,
        data: {
          session_id: session.id,
          scheduled_at: session.scheduled_at,
          duration_minutes: session.duration_minutes,
          status: session.status,
        },
        message: 'Session scheduled successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to schedule session', { error, userId });
      throw new BadRequestException('Failed to schedule session');
    }
  }

  async startMentorshipChat(
    userId: string,
    directRequestId: string,
    initialMessage?: string,
  ) {
    try {
      // Get direct request details
      const { data: request, error: reqError } = await this.admin
        .from('mentorship_direct_requests')
        .select('requester_id, target_user_id, request_type, status')
        .eq('id', directRequestId)
        .single();

      if (reqError || !request) {
        throw new NotFoundException('Direct request not found');
      }

      // Verify user is part of this request
      if (
        request.requester_id !== userId &&
        request.target_user_id !== userId
      ) {
        throw new ForbiddenException('Not authorized for this request');
      }

      if (request.status !== 'accepted') {
        throw new BadRequestException(
          'Direct request must be accepted to start chat',
        );
      }

      const otherUserId =
        request.requester_id === userId
          ? request.target_user_id
          : request.requester_id;

      // Check if mentorship relationship exists
      const { data: existingRelationship } = await this.admin
        .from('mentorship_relationships')
        .select('id')
        .or(
          `and(mentor_id.eq.${userId},mentee_id.eq.${otherUserId}),and(mentor_id.eq.${otherUserId},mentee_id.eq.${userId})`,
        )
        .maybeSingle();

      let relationshipId = existingRelationship?.id;

      // Create relationship if it doesn't exist
      if (!relationshipId) {
        const mentorId =
          request.request_type === 'mentor_request'
            ? request.target_user_id
            : request.requester_id;
        const menteeId =
          request.request_type === 'mentor_request'
            ? request.requester_id
            : request.target_user_id;

        const relationshipData = {
          mentor_id: mentorId,
          mentee_id: menteeId,
          status: 'active',
          started_at: new Date().toISOString(),
        };

        const { data: newRelationship, error: relError } = await this.admin
          .from('mentorship_relationships')
          .insert([relationshipData])
          .select()
          .single();

        if (relError) throw relError;
        relationshipId = newRelationship.id;
      }

      // Create or get mentorship conversation
      const { data: existingConversation } = await this.admin
        .from('conversations')
        .select('id')
        .or(
          `and(user1_id.eq.${userId},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${userId})`,
        )
        .eq('context_type', 'mentorship')
        .eq('context_id', relationshipId)
        .maybeSingle();

      let conversationId = existingConversation?.id;

      if (!conversationId) {
        const conversationData = {
          user1_id: userId,
          user2_id: otherUserId,
          context_type: 'mentorship',
          context_id: relationshipId,
          is_active: true,
          last_message_at: new Date().toISOString(),
        };

        const { data: conversation, error: convError } = await this.admin
          .from('conversations')
          .insert([conversationData])
          .select()
          .single();

        if (convError) throw convError;
        conversationId = conversation.id;

        // Send initial message if provided
        if (initialMessage) {
          const messageData = {
            conversation_id: conversationId,
            sender_id: userId,
            content_encrypted: this.encryption.encrypt(initialMessage),
            content_type: 'text',
            is_delivered: false,
            is_read: false,
          };

          await this.admin.from('messages').insert([messageData]);
        }
      }

      return {
        success: true,
        data: {
          conversation_id: conversationId,
          relationship_id: relationshipId,
          other_user: {
            id: otherUserId,
            role:
              request.request_type === 'mentor_request'
                ? userId === request.requester_id
                  ? 'mentee'
                  : 'mentor'
                : userId === request.requester_id
                  ? 'mentor'
                  : 'mentee',
          },
          chat_type: 'mentorship',
        },
        message: 'Mentorship chat started successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Failed to start mentorship chat', { error, userId });
      throw new BadRequestException('Failed to start mentorship chat');
    }
  }

  private isUserOnline(lastActive: string): boolean {
    if (!lastActive) return false;
    const lastActiveDate = new Date(lastActive);
    const now = new Date();
    const diffInMinutes =
      (now.getTime() - lastActiveDate.getTime()) / (1000 * 60);
    return diffInMinutes < 5; // Consider online if active in last 5 minutes
  }
}
