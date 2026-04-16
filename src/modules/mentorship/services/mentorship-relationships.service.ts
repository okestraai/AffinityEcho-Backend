import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { RelationshipStatusDto } from '../dto/relationship-status.dto';
import { RelationshipUpdateDto } from '../dto/relationship-update.dto';
import { MENTORSHIP_RELATIONSHIP_FIELDS } from '../../../common/constants/select-fields';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class MentorshipRelationshipsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getRelationships(userId: string, role?: string, status?: string) {
    try {
      const relationshipSelect = `
          *,
          mentor:user_profiles!mentor_relationships(
            id,
            username,
            avatar,
            job_title,
            company_type,
            mentor_bio,
            mentor_expertise,
            affinity_tags_encrypted,
            is_company_verified
          ),
          mentee:user_profiles!mentee_relationships(
            id,
            username,
            avatar,
            job_title,
            company_type,
            mentee_goals,
            mentee_interests,
            affinity_tags_encrypted,
            is_company_verified
          )
        `;

      let mentorQuery = this.admin
        .from('mentorship_relationships')
        .select(relationshipSelect)
        .eq('mentor_id', userId);

      let menteeQuery = this.admin
        .from('mentorship_relationships')
        .select(relationshipSelect)
        .eq('mentee_id', userId);

      // Apply status filter if specified
      if (status) {
        mentorQuery = mentorQuery.eq('status', status);
        menteeQuery = menteeQuery.eq('status', status);
      }

      const [{ data: asMentor }, { data: asMentee }] = await Promise.all([
        mentorQuery,
        menteeQuery,
      ]);

      // Parse affinity tags on mentor/mentee profiles
      const parseAffinityTags = (relationships: any[]) => {
        return (relationships || []).map((rel: any) => {
          const processUser = (user: any) => {
            if (!user) return user;
            let affinityTags: string[] = [];
            if (user.affinity_tags_encrypted) {
              try {
                affinityTags = JSON.parse(user.affinity_tags_encrypted);
              } catch {
                affinityTags = [];
              }
            }
            const { affinity_tags_encrypted, ...rest } = user;
            return { ...rest, affinity_tags: affinityTags };
          };
          return {
            ...rel,
            mentor: processUser(rel.mentor),
            mentee: processUser(rel.mentee),
          };
        });
      };

      const processedMentor = parseAffinityTags(asMentor || []);
      const processedMentee = parseAffinityTags(asMentee || []);

      // Filter by role if specified
      if (role === 'mentor') {
        return { asMentor: processedMentor, asMentee: [] };
      } else if (role === 'mentee') {
        return { asMentor: [], asMentee: processedMentee };
      }

      return {
        asMentor: processedMentor,
        asMentee: processedMentee,
      };
    } catch (error) {
      throw new BadRequestException('Failed to retrieve relationships');
    }
  }

  async getRelationship(relationshipId: string) {
    try {
      const { data: relationship, error } = await this.admin
        .from('mentorship_relationships')
        .select(
          `
          *,
          mentor:user_profiles!mentor_relationships(
            id,
            username,
            avatar,
            job_title,
            company_type,
            mentor_bio,
            mentor_expertise,
            mentor_industries,
            mentor_availability,
            mentor_response_time,
            mentor_style,
            mentor_languages,
            affinity_tags_encrypted,
            is_company_verified
          ),
          mentee:user_profiles!mentee_relationships(
            id,
            username,
            avatar,
            job_title,
            company_type,
            mentee_goals,
            mentee_interests,
            years_experience,
            skills,
            affinity_tags_encrypted,
            is_company_verified
          ),
          sessions:mentorship_sessions(
            id,
            scheduled_at,
            duration_minutes,
            meeting_url,
            agenda_encrypted,
            status,
            mentor_notes_encrypted,
            mentee_notes_encrypted,
            session_notes_encrypted,
            mentor_rating,
            mentee_rating,
            created_at
          )
        `,
        )
        .eq('id', relationshipId)
        .single();

      if (error || !relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      // Parse affinity tags
      const processUser = (user: any) => {
        if (!user) return user;
        let affinityTags: string[] = [];
        if (user.affinity_tags_encrypted) {
          try {
            affinityTags = JSON.parse(user.affinity_tags_encrypted);
          } catch {
            affinityTags = [];
          }
        }
        const { affinity_tags_encrypted, ...rest } = user;
        return { ...rest, affinity_tags: affinityTags };
      };

      return {
        ...relationship,
        mentor: processUser(relationship.mentor),
        mentee: processUser(relationship.mentee),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve relationship');
    }
  }

  async updateRelationshipStatus(
    relationshipId: string,
    userId: string,
    statusDto: RelationshipStatusDto,
  ) {
    try {
      const { action, reason, rating, feedback, notes } = statusDto;

      switch (action) {
        case 'accept':
          return this.acceptRelationship(relationshipId, userId);
        case 'decline':
          return this.declineRelationship(relationshipId, userId, reason);
        case 'complete':
          return this.completeRelationship(
            relationshipId,
            userId,
            rating,
            feedback,
          );
        case 'cancel':
          return this.cancelRelationship(relationshipId, userId, reason);
        default:
          throw new BadRequestException('Invalid action');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update relationship status');
    }
  }

  async updateRelationshipDetails(
    relationshipId: string,
    userId: string,
    updateDto: RelationshipUpdateDto,
  ) {
    try {
      const { action, ...data } = updateDto;

      // Get relationship to check user role
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      // Check if user is part of relationship
      if (
        relationship.mentor_id !== userId &&
        relationship.mentee_id !== userId
      ) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      const updatePayload: any = {
        updated_at: new Date().toISOString(),
      };

      switch (action) {
        case 'contact':
          updatePayload.last_contact_at = new Date().toISOString();
          if (data.notes) {
            // Store notes based on user role
            if (relationship.mentor_id === userId) {
              updatePayload.mentor_feedback_encrypted = data.notes;
            } else {
              updatePayload.mentee_feedback_encrypted = data.notes;
            }
          }
          break;
        case 'frequency':
          updatePayload.meeting_frequency = data.meetingFrequency;
          if (data.nextSessionAt) {
            updatePayload.next_session_at = data.nextSessionAt;
            if (relationship.status === 'accepted') {
              updatePayload.status = 'active';
            }
          }
          break;
        case 'goals':
          if (data.menteeGoals) {
            updatePayload.mentee_goals_encrypted = data.menteeGoals;
          }
          if (data.mentorSkills) {
            updatePayload.mentor_skills = data.mentorSkills;
          }
          break;
        case 'general':
          // Handle general updates
          if (data.generalUpdates) {
            Object.assign(updatePayload, data.generalUpdates);
          }
          break;
        default:
          throw new BadRequestException('Invalid update action');
      }

      const { data: updatedRelationship, error } = await this.admin
        .from('mentorship_relationships')
        .update(updatePayload)
        .eq('id', relationshipId)
        .select(MENTORSHIP_RELATIONSHIP_FIELDS)
        .single();

      if (error) {
        throw new BadRequestException('Failed to update relationship');
      }

      return {
        message: MSG.MENTORSHIP.RELATIONSHIP_UPDATED,
        relationship: updatedRelationship,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to update relationship');
    }
  }

  async acceptRelationship(relationshipId: string, userId: string) {
    try {
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      // Check if user is the mentee (only mentee can accept)
      if (relationship.mentee_id !== userId) {
        throw new ForbiddenException(
          'Only the mentee can accept the relationship',
        );
      }

      if (relationship.status !== 'pending') {
        throw new BadRequestException(
          `Relationship is already ${relationship.status}`,
        );
      }

      const { data: updatedRelationship, error } = await this.admin
        .from('mentorship_relationships')
        .update({
          status: 'accepted',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationshipId)
        .select(MENTORSHIP_RELATIONSHIP_FIELDS)
        .single();

      if (error) {
        throw new BadRequestException('Failed to accept relationship');
      }

      // Create notification for the mentor
      await this.createNotification(
        relationship.mentor_id,
        userId,
        'mentorship_accepted',
        'Mentorship Accepted',
        'Your mentorship relationship has been accepted',
        `/mentorship/relationships/${relationshipId}`,
        relationshipId,
        'mentorship_relationship',
      );

      return {
        message: MSG.MENTORSHIP.RELATIONSHIP_ACCEPTED,
        relationship: updatedRelationship,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to accept relationship');
    }
  }

  async declineRelationship(
    relationshipId: string,
    userId: string,
    reason?: string,
  ) {
    try {
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      // Check if user is part of relationship
      if (
        relationship.mentor_id !== userId &&
        relationship.mentee_id !== userId
      ) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      if (relationship.status !== 'pending') {
        throw new BadRequestException(
          `Cannot decline a ${relationship.status} relationship`,
        );
      }

      const { data: updatedRelationship, error } = await this.admin
        .from('mentorship_relationships')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          mentee_feedback_encrypted: reason,
        })
        .eq('id', relationshipId)
        .select(MENTORSHIP_RELATIONSHIP_FIELDS)
        .single();

      if (error) {
        throw new BadRequestException('Failed to decline relationship');
      }

      // Create notification for the other party
      const otherUserId =
        relationship.mentor_id === userId
          ? relationship.mentee_id
          : relationship.mentor_id;
      await this.createNotification(
        otherUserId,
        userId,
        'mentorship_declined',
        'Mentorship Declined',
        `Your mentorship relationship has been declined${reason ? `: ${reason}` : ''}`,
        null,
        relationshipId,
        'mentorship_relationship',
      );

      return {
        message: 'Relationship declined successfully',
        relationship: updatedRelationship,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to decline relationship');
    }
  }

  async completeRelationship(
    relationshipId: string,
    userId: string,
    rating?: number,
    feedback?: string,
  ) {
    try {
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      if (!['accepted', 'active'].includes(relationship.status)) {
        throw new BadRequestException(
          `Cannot complete a ${relationship.status} relationship`,
        );
      }

      // Determine if user is mentor or mentee
      const isMentor = relationship.mentor_id === userId;
      const isMentee = relationship.mentee_id === userId;

      if (!isMentor && !isMentee) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      const updateData: any = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Update rating and feedback based on user role
      if (isMentor && rating !== undefined) {
        updateData.mentor_rating = rating;
        if (feedback) {
          updateData.mentor_feedback_encrypted = feedback;
        }
      } else if (isMentee && rating !== undefined) {
        updateData.mentee_rating = rating;
        if (feedback) {
          updateData.mentee_feedback_encrypted = feedback;
        }
      }

      const { data: updatedRelationship, error } = await this.admin
        .from('mentorship_relationships')
        .update(updateData)
        .eq('id', relationshipId)
        .select(MENTORSHIP_RELATIONSHIP_FIELDS)
        .single();

      if (error) {
        throw new BadRequestException('Failed to complete relationship');
      }

      // Update user stats
      if (isMentor) {
        await this.updateMentorStats(relationship.mentor_id);
      }

      // Create notification for the other party
      const otherUserId = isMentor
        ? relationship.mentee_id
        : relationship.mentor_id;
      await this.createNotification(
        otherUserId,
        userId,
        'mentorship_completed',
        'Mentorship Completed',
        'Your mentorship relationship has been completed',
        `/mentorship/relationships/${relationshipId}`,
        relationshipId,
        'mentorship_relationship',
      );

      return {
        message: 'Relationship completed successfully',
        relationship: updatedRelationship,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to complete relationship');
    }
  }

  async cancelRelationship(
    relationshipId: string,
    userId: string,
    reason?: string,
  ) {
    try {
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id, status')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      // Check if user is part of relationship
      if (
        relationship.mentor_id !== userId &&
        relationship.mentee_id !== userId
      ) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      if (!['accepted', 'active', 'pending'].includes(relationship.status)) {
        throw new BadRequestException(
          `Cannot cancel a ${relationship.status} relationship`,
        );
      }

      const { data: updatedRelationship, error } = await this.admin
        .from('mentorship_relationships')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          mentee_feedback_encrypted: reason,
        })
        .eq('id', relationshipId)
        .select(MENTORSHIP_RELATIONSHIP_FIELDS)
        .single();

      if (error) {
        throw new BadRequestException('Failed to cancel relationship');
      }

      // Create notification for the other party
      const otherUserId =
        relationship.mentor_id === userId
          ? relationship.mentee_id
          : relationship.mentor_id;
      await this.createNotification(
        otherUserId,
        userId,
        'mentorship_cancelled',
        'Mentorship Cancelled',
        `Your mentorship relationship has been cancelled${reason ? `: ${reason}` : ''}`,
        null,
        relationshipId,
        'mentorship_relationship',
      );

      return {
        message: 'Relationship cancelled successfully',
        relationship: updatedRelationship,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to cancel relationship');
    }
  }

  async getUserStats(userId: string) {
    try {
      // Get mentor stats
      const { data: mentorRelationships } = await this.admin
        .from('mentorship_relationships')
        .select('status, mentor_rating, total_sessions, completed_sessions')
        .eq('mentor_id', userId);

      // Get mentee stats
      const { data: menteeRelationships } = await this.admin
        .from('mentorship_relationships')
        .select('status, mentee_rating, total_sessions, completed_sessions')
        .eq('mentee_id', userId);

      // Calculate mentor stats
      const mentorStats = this.calculateStats(
        mentorRelationships || [],
        'mentor',
      );

      // Calculate mentee stats
      const menteeStats = this.calculateStats(
        menteeRelationships || [],
        'mentee',
      );

      // Get user profile for response time
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('mentor_response_time')
        .eq('id', userId)
        .single();

      return {
        asMentor: {
          ...mentorStats,
          responseTime: profile?.mentor_response_time || 'Not specified',
        },
        asMentee: menteeStats,
      };
    } catch (error) {
      throw new BadRequestException('Failed to retrieve stats');
    }
  }

  async reportRelationship(
    relationshipId: string,
    userId: string,
    reportData: any,
  ) {
    try {
      const { data: relationship } = await this.admin
        .from('mentorship_relationships')
        .select('mentor_id, mentee_id')
        .eq('id', relationshipId)
        .single();

      if (!relationship) {
        throw new NotFoundException(MSG.MENTORSHIP.RELATIONSHIP_NOT_FOUND);
      }

      if (![relationship.mentor_id, relationship.mentee_id].includes(userId)) {
        throw new ForbiddenException(MSG.MENTORSHIP.NOT_IN_RELATIONSHIP);
      }

      // Here you would typically store the report in a separate table
      // and notify administrators
      // For now, we'll return a success response

      return {
        message: MSG.MENTORSHIP.REPORT_SUBMITTED,
        reportId: 'report_' + Date.now(),
        data: {
          relationshipId,
          reporterId: userId,
          ...reportData,
          reportedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to submit report');
    }
  }

  private calculateStats(relationships: any[], role: 'mentor' | 'mentee') {
    const totalRelationships = relationships.length;
    const activeRelationships = relationships.filter((r) =>
      ['accepted', 'active'].includes(r.status),
    ).length;
    const completedRelationships = relationships.filter(
      (r) => r.status === 'completed',
    ).length;

    const totalSessions = relationships.reduce(
      (sum, r) => sum + (r.total_sessions || 0),
      0,
    );
    const completedSessions = relationships.reduce(
      (sum, r) => sum + (r.completed_sessions || 0),
      0,
    );

    // Calculate average rating
    const ratingField = role === 'mentor' ? 'mentor_rating' : 'mentee_rating';
    const ratings = relationships
      .filter((r) => r[ratingField])
      .map((r) => r[ratingField]);
    const averageRating =
      ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

    return {
      total: totalRelationships,
      active: activeRelationships,
      completed: completedRelationships,
      totalSessions,
      completedSessions,
      averageRating: parseFloat(averageRating.toFixed(1)),
    };
  }

  private async updateMentorStats(mentorId: string) {
    // Update mentor's completed sessions count
    const { data: relationships } = await this.admin
      .from('mentorship_relationships')
      .select('completed_sessions')
      .eq('mentor_id', mentorId)
      .eq('status', 'completed');

    const totalCompletedSessions =
      relationships?.reduce(
        (sum: any, r: any) => sum + (r.completed_sessions || 0),
        0,
      ) || 0;

    await this.admin
      .from('user_profiles')
      .update({
        mentorship_sessions_completed: totalCompletedSessions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mentorId);
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
  }
}
