import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { CreateMentorProfileDto } from '../dto/create-mentor-profile.dto';
import { UpdateMentorProfileDto } from '../dto/update-mentor-profile.dto';
import { CreateMenteeProfileDto } from '../dto/create-mentee-profile.dto';
import { UpdateMenteeProfileDto } from '../dto/update-mentee-profile.dto';
import { USER_PROFILE_MENTORSHIP_FIELDS } from '../../../common/constants/select-fields';

@Injectable()
export class MentorshipProfileService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  private decryptField(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return this.encryption.decrypt(value);
    } catch {
      return null;
    }
  }

  private decryptAffinityTags(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const decrypted = this.encryption.decrypt(value);
      const parsed = JSON.parse(decrypted);
      if (typeof parsed === 'string') return JSON.parse(parsed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'string') return JSON.parse(parsed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  }

  // ========== MENTOR PROFILE METHODS ==========

  async setupMentorProfile(userId: string, dto: CreateMentorProfileDto) {
    try {
      // Check if user exists
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select(
          'id, username, mentoring_as, is_active_mentee, career_level_encrypted, company_encrypted, affinity_tags_encrypted',
        )
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      // Build update data — careerLevel, company, affinityTags are read from the user's base profile (set during onboarding)
      const updateData: any = {
        // SHARED FIELDS (Required)
        bio: dto.bio,
        job_title: dto.jobTitle,
        location: dto.location,
        years_experience: dto.yearsExperience,
        updated_at: new Date().toISOString(),

        // MENTOR-SPECIFIC FIELDS
        is_willing_to_mentor: dto.isWillingToMentor,
        is_active_mentor: dto.isWillingToMentor,
        mentor_bio: dto.mentorBio || dto.bio, // Default to bio if mentorBio not provided
        mentor_expertise: dto.expertise || [],
        mentor_industries: dto.industries || [],
        mentor_availability: dto.availability,
        mentor_response_time: dto.responseTime || 'Not specified',
        mentor_style: dto.mentoringStyle,
        mentor_languages: dto.languages || ['English'],
        mentor_hourly_rate: dto.hourlyRate,
        mentor_profile_created_at: dto.isWillingToMentor
          ? new Date().toISOString()
          : null,
      };

      // OPTIONAL SHARED FIELDS
      if (dto.skills?.length) {
        updateData.skills = dto.skills;
      }
      if (dto.linkedinUrl) {
        updateData.linkedin_url = dto.linkedinUrl;
      }

      // Determine mentoring role
      updateData.mentoring_as = user.is_active_mentee ? 'both' : 'mentor';

      const { data: updatedProfile, error: updateError } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select(USER_PROFILE_MENTORSHIP_FIELDS)
        .single();

      if (updateError) {
        console.error('Mentor profile update error:', updateError);
        throw new BadRequestException('Failed to create mentor profile');
      }

      return {
        success: true,
        message: 'Mentor profile created successfully',
        data: updatedProfile,
      };
    } catch (error) {
      console.error('Setup mentor profile error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to create mentor profile');
    }
  }

  async updateMentorProfile(userId: string, dto: UpdateMentorProfileDto) {
    try {
      // Check if user exists and is a mentor
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, username, mentoring_as, is_active_mentor')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      if (!user.is_active_mentor && user.mentoring_as !== 'both') {
        throw new BadRequestException('User is not registered as a mentor');
      }

      // Build update object
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // MENTOR-SPECIFIC FIELDS
      if (dto.isWillingToMentor !== undefined) {
        updateData.is_willing_to_mentor = dto.isWillingToMentor;
        updateData.is_active_mentor = dto.isWillingToMentor;
      }
      if (dto.mentorBio !== undefined) updateData.mentor_bio = dto.mentorBio;
      if (dto.expertise !== undefined)
        updateData.mentor_expertise = dto.expertise;
      if (dto.industries !== undefined)
        updateData.mentor_industries = dto.industries;
      if (dto.availability !== undefined)
        updateData.mentor_availability = dto.availability;
      if (dto.responseTime !== undefined)
        updateData.mentor_response_time = dto.responseTime;
      if (dto.mentoringStyle !== undefined)
        updateData.mentor_style = dto.mentoringStyle;
      if (dto.languages !== undefined)
        updateData.mentor_languages = dto.languages;
      if (dto.hourlyRate !== undefined)
        updateData.mentor_hourly_rate = dto.hourlyRate;

      // SHARED FIELDS
      if (dto.bio !== undefined) updateData.bio = dto.bio;
      if (dto.jobTitle !== undefined) updateData.job_title = dto.jobTitle;
      if (dto.location !== undefined) updateData.location = dto.location;
      if (dto.yearsExperience !== undefined)
        updateData.years_experience = dto.yearsExperience;
      if (dto.skills !== undefined) updateData.skills = dto.skills;
      if (dto.linkedinUrl !== undefined)
        updateData.linkedin_url = dto.linkedinUrl;

      // Update user profile
      const { data: updatedProfile, error: updateError } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select(USER_PROFILE_MENTORSHIP_FIELDS)
        .single();

      if (updateError) {
        console.error('Update mentor profile error:', updateError);
        throw new BadRequestException('Failed to update mentor profile');
      }

      return {
        success: true,
        message: 'Mentor profile updated successfully',
        data: updatedProfile,
      };
    } catch (error) {
      console.error('Update mentor profile error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to update mentor profile');
    }
  }

  // ========== MENTEE PROFILE METHODS ==========

  async setupMenteeProfile(userId: string, dto: CreateMenteeProfileDto) {
    try {
      // Check if user exists
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select(
          'id, username, mentoring_as, is_active_mentor, career_level_encrypted, company_encrypted, affinity_tags_encrypted',
        )
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      // Build update data — careerLevel, company, affinityTags are read from the user's base profile (set during onboarding)
      const updateData: any = {
        // SHARED FIELDS (Required)
        bio: dto.bio,
        job_title: dto.jobTitle,
        location: dto.location,
        years_experience: dto.yearsExperience,
        communication_method: dto.communicationMethod,
        updated_at: new Date().toISOString(),

        // MENTEE-SPECIFIC FIELDS
        mentee_bio: dto.menteeBio || dto.bio, // Default to bio if menteeBio not provided
        mentee_goals: dto.goals,
        mentee_interests: dto.interests || [],
        mentee_industries: dto.menteeIndustries || [],
        mentee_availability: dto.availability,
        mentee_urgency: dto.urgency,
        mentee_topic: dto.topic,
        mentored_style: dto.mentoredStyle,
        mentee_languages: dto.menteeLanguages || ['English'],
        is_active_mentee: true,
        mentee_profile_created_at: new Date().toISOString(),
      };

      // OPTIONAL SHARED FIELDS
      if (dto.skills?.length) {
        updateData.skills = dto.skills;
      }
      if (dto.linkedinUrl) {
        updateData.linkedin_url = dto.linkedinUrl;
      }

      // Determine mentoring role
      updateData.mentoring_as = user.is_active_mentor ? 'both' : 'mentee';

      const { data: updatedProfile, error: updateError } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select(USER_PROFILE_MENTORSHIP_FIELDS)
        .single();

      if (updateError) {
        console.error('Mentee profile update error:', updateError);
        throw new BadRequestException('Failed to create mentee profile');
      }

      return {
        success: true,
        message: 'Mentee profile created successfully',
        data: updatedProfile,
      };
    } catch (error) {
      console.error('Setup mentee profile error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to create mentee profile');
    }
  }

  async updateMenteeProfile(userId: string, dto: UpdateMenteeProfileDto) {
    try {
      // Check if user exists and is a mentee
      const { data: user, error: userError } = await this.admin
        .from('user_profiles')
        .select('id, username, mentoring_as, is_active_mentee')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundException('User not found');
      }

      if (!user.is_active_mentee && user.mentoring_as !== 'both') {
        throw new BadRequestException('User is not registered as a mentee');
      }

      // Build update object
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // MENTEE-SPECIFIC FIELDS
      if (dto.goals !== undefined) updateData.mentee_goals = dto.goals;
      if (dto.topic !== undefined) updateData.mentee_topic = dto.topic;
      if (dto.availability !== undefined)
        updateData.mentee_availability = dto.availability;
      if (dto.urgency !== undefined) updateData.mentee_urgency = dto.urgency;
      if (dto.communicationMethod !== undefined)
        updateData.communication_method = dto.communicationMethod;
      if (dto.menteeBio !== undefined) updateData.mentee_bio = dto.menteeBio;
      if (dto.mentoredStyle !== undefined)
        updateData.mentored_style = dto.mentoredStyle;
      if (dto.interests !== undefined)
        updateData.mentee_interests = dto.interests;
      if (dto.menteeIndustries !== undefined)
        updateData.mentee_industries = dto.menteeIndustries;
      if (dto.menteeLanguages !== undefined)
        updateData.mentee_languages = dto.menteeLanguages;

      // SHARED FIELDS
      if (dto.bio !== undefined) updateData.bio = dto.bio;
      if (dto.jobTitle !== undefined) updateData.job_title = dto.jobTitle;
      if (dto.location !== undefined) updateData.location = dto.location;
      if (dto.yearsExperience !== undefined)
        updateData.years_experience = dto.yearsExperience;
      if (dto.skills !== undefined) updateData.skills = dto.skills;
      if (dto.linkedinUrl !== undefined)
        updateData.linkedin_url = dto.linkedinUrl;

      // Update user profile
      const { data: updatedProfile, error: updateError } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select(USER_PROFILE_MENTORSHIP_FIELDS)
        .single();

      if (updateError) {
        console.error('Update mentee profile error:', updateError);
        throw new BadRequestException('Failed to update mentee profile');
      }

      return {
        success: true,
        message: 'Mentee profile updated successfully',
        data: updatedProfile,
      };
    } catch (error) {
      console.error('Update mentee profile error:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException('Failed to update mentee profile');
    }
  }

  // ========== PROFILE MANAGEMENT ==========

  async getProfile(userId: string) {
    try {
      const { data: profile, error } = await this.admin
        .from('user_profiles')
        .select(
          `
        id,
        username,
        email,
        avatar,
        bio,
        job_title,
        location,
        years_experience,
        skills,
        linkedin_url,
        career_level_encrypted,
        company_encrypted,
        affinity_tags_encrypted,
        mentor_bio,
        mentor_expertise,
        mentor_industries,
        mentor_availability,
        mentor_response_time,
        mentor_style,
        mentor_languages,
        mentor_hourly_rate,
        is_active_mentor,
        mentor_profile_created_at,
        is_willing_to_mentor,
        mentee_bio,
        mentee_goals,
        mentee_interests,
        mentee_industries,
        mentee_availability,
        mentee_urgency,
        mentee_topic,
        mentored_style,
        mentee_languages,
        is_active_mentee,
        mentee_profile_created_at,
        mentoring_as,
        communication_method,
        reputation_score,
        mentorship_sessions_completed,
        total_posts,
        total_comments,
        helpful_votes_received,
        created_at,
        updated_at,
        last_active_at,
        is_deleted,
        is_deactivated,
        is_company_verified
      `,
        )
        .eq('id', userId)
        .single();

      if (error || !profile) {
        throw new NotFoundException('Profile not found');
      }

      // Hide soft-deleted or deactivated profiles
      if (profile.is_deleted || profile.is_deactivated) {
        throw new NotFoundException('Profile not found');
      }

      // Get follow counts
      const [{ data: followers }, { data: following }] = await Promise.all([
        this.admin
          .from('user_follows')
          .select('id', { count: 'exact', head: true })
          .eq('following_id', userId),
        this.admin
          .from('user_follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', userId),
      ]);

      return {
        success: true,
        data: {
          // Basic info
          id: profile.id,
          username: profile.username,
          email: profile.email,
          avatar: profile.avatar,

          // Shared profile
          basicProfile: {
            bio: profile.bio,
            jobTitle: profile.job_title,
            location: profile.location,
            yearsExperience: profile.years_experience,
            skills: profile.skills || [],
            linkedinUrl: profile.linkedin_url,
            careerLevel: this.decryptField(profile.career_level_encrypted),
            company: this.decryptField(profile.company_encrypted),
            affinityTags: this.decryptAffinityTags(
              profile.affinity_tags_encrypted,
            ),
          },

          // Mentor profile (if active)
          mentorProfile: profile.is_active_mentor
            ? {
                bio: profile.mentor_bio,
                expertise: profile.mentor_expertise || [],
                industries: profile.mentor_industries || [],
                availability: profile.mentor_availability,
                responseTime: profile.mentor_response_time,
                style: profile.mentor_style,
                mentorStyle: profile.mentor_style,
                languages: profile.mentor_languages || [],
                hourlyRate: profile.mentor_hourly_rate,
                isWillingToMentor: profile.is_willing_to_mentor,
                isActive: profile.is_active_mentor,
                createdAt: profile.mentor_profile_created_at,
              }
            : null,

          // Mentee profile (if active)
          menteeProfile: profile.is_active_mentee
            ? {
                bio: profile.mentee_bio,
                goals: profile.mentee_goals,
                interests: profile.mentee_interests || [],
                industries: profile.mentee_industries || [],
                availability: profile.mentee_availability,
                mentoredStyle: profile.mentored_style,
                urgency: profile.mentee_urgency,
                topic: profile.mentee_topic,
                style: profile.mentored_style,
                languages: profile.mentee_languages || [],
                isActive: profile.is_active_mentee,
                createdAt: profile.mentee_profile_created_at,
              }
            : null,

          // Profile status
          status: {
            mentoringAs: profile.mentoring_as,
            communicationMethod: profile.communication_method,
            isActiveMentor: profile.is_active_mentor,
            isActiveMentee: profile.is_active_mentee,
          },

          // Stats (live counts from actual tables)
          stats: await (async () => {
            const [postsResult, commentsResult, topicsResult] =
              await Promise.all([
                this.admin
                  .from('feed_posts')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', profile.id)
                  .eq('is_archived', false),
                this.admin
                  .from('forum_comments')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', profile.id),
                this.admin
                  .from('forum_topics')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', profile.id),
              ]);
            const totalPosts = postsResult.count || 0;
            const totalComments = commentsResult.count || 0;
            const totalTopics = topicsResult.count || 0;
            const mentorshipSessions =
              profile.mentorship_sessions_completed || 0;
            const followersCount = followers?.length || 0;
            const followingCount = following?.length || 0;
            return {
              reputationScore:
                totalPosts * 5 +
                totalComments * 2 +
                totalTopics * 5 +
                mentorshipSessions * 10 +
                followersCount * 2,
              mentorshipSessionsCompleted: mentorshipSessions,
              totalPosts,
              totalComments,
              totalTopics,
              followersCount,
              followingCount,
            };
          })(),

          // Timestamps
          timestamps: {
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
            lastActiveAt: profile.last_active_at,
          },
        },
      };
    } catch (error) {
      console.error('Get profile error:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve profile');
    }
  }

  async deactivateProfileSection(userId: string, section: 'mentor' | 'mentee') {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (section === 'mentor') {
        updateData.is_active_mentor = false;
        updateData.is_willing_to_mentor = false;
      } else if (section === 'mentee') {
        updateData.is_active_mentee = false;
      }

      // Get current profile to determine new mentoring_as
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('is_active_mentor, is_active_mentee')
        .eq('id', userId)
        .single();

      if (profile) {
        const activeMentor =
          section === 'mentor' ? false : profile.is_active_mentor;
        const activeMentee =
          section === 'mentee' ? false : profile.is_active_mentee;

        if (activeMentor && activeMentee) {
          updateData.mentoring_as = 'both';
        } else if (activeMentor) {
          updateData.mentoring_as = 'mentor';
        } else if (activeMentee) {
          updateData.mentoring_as = 'mentee';
        } else {
          updateData.mentoring_as = null;
        }

        // If both sections are now inactive, soft-deactivate the entire profile
        if (!activeMentor && !activeMentee) {
          updateData.is_deactivated = true;
          updateData.deactivated_at = new Date().toISOString();
        }
      }

      const { data, error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select('id, is_active_mentor, is_active_mentee, mentoring_as')
        .single();

      if (error) {
        console.error('Deactivate profile section error:', error);
        throw new BadRequestException('Failed to deactivate profile section');
      }

      return {
        success: true,
        message: `${section} profile deactivated successfully`,
        data: data,
      };
    } catch (error) {
      console.error('Deactivate profile section error:', error);
      throw new BadRequestException('Failed to deactivate profile section');
    }
  }

  async toggleProfileSection(userId: string, section: 'mentor' | 'mentee') {
    try {
      const { data: profile, error: fetchError } = await this.admin
        .from('user_profiles')
        .select('is_active_mentor, is_active_mentee, is_willing_to_mentor')
        .eq('id', userId)
        .single();

      if (fetchError || !profile) {
        throw new NotFoundException('User not found');
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      let newState: boolean;

      if (section === 'mentor') {
        newState = !profile.is_active_mentor;
        updateData.is_active_mentor = newState;
        updateData.is_willing_to_mentor = newState;
      } else {
        newState = !profile.is_active_mentee;
        updateData.is_active_mentee = newState;
      }

      // Determine new mentoring_as value
      const activeMentor =
        section === 'mentor' ? newState : profile.is_active_mentor;
      const activeMentee =
        section === 'mentee' ? newState : profile.is_active_mentee;

      if (activeMentor && activeMentee) {
        updateData.mentoring_as = 'both';
      } else if (activeMentor) {
        updateData.mentoring_as = 'mentor';
      } else if (activeMentee) {
        updateData.mentoring_as = 'mentee';
      } else {
        updateData.mentoring_as = null;
      }

      // Reactivate profile if a section is being turned on
      if (newState) {
        updateData.is_deactivated = false;
        updateData.deactivated_at = null;
      }

      const { data, error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select(USER_PROFILE_MENTORSHIP_FIELDS)
        .single();

      if (error) {
        throw new BadRequestException(`Failed to toggle ${section} status`);
      }

      return {
        success: true,
        message: `${section} profile ${newState ? 'activated' : 'deactivated'} successfully`,
        data,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(`Failed to toggle ${section} status`);
    }
  }

  async checkProfileExists(userId: string) {
    try {
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('id, is_active_mentor, is_active_mentee, mentoring_as')
        .eq('id', userId)
        .single();

      if (!profile) {
        return {
          hasProfile: false,
          hasMentorProfile: false,
          hasMenteeProfile: false,
          isActiveMentor: false,
          isActiveMentee: false,
          mentoringAs: null,
        };
      }

      return {
        hasProfile: true,
        hasMentorProfile: profile.is_active_mentor,
        hasMenteeProfile: profile.is_active_mentee,
        isActiveMentor: profile.is_active_mentor,
        isActiveMentee: profile.is_active_mentee,
        mentoringAs: profile.mentoring_as,
      };
    } catch (error) {
      console.error('Check profile exists error:', error);
      return {
        hasProfile: false,
        hasMentorProfile: false,
        hasMenteeProfile: false,
        isActiveMentor: false,
        isActiveMentee: false,
        mentoringAs: null,
      };
    }
  }

  async isProfileActive(userId: string): Promise<boolean> {
    try {
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select('is_active_mentor, is_active_mentee')
        .eq('id', userId)
        .single();

      if (!profile) return false;

      return profile.is_active_mentor || profile.is_active_mentee;
    } catch (error) {
      return false;
    }
  }

  async checkProfileRequirement(userId: string) {
    try {
      const { data: profile } = await this.admin
        .from('user_profiles')
        .select(
          'is_active_mentor, is_active_mentee, mentor_bio, mentor_expertise, mentee_goals, job_title, location, bio, career_level_encrypted, company_encrypted',
        )
        .eq('id', userId)
        .single();

      if (!profile) {
        return {
          success: true,
          data: {
            hasProfile: false,
            hasMentorProfile: false,
            hasMenteeProfile: false,
            missingSharedFields: ['all'],
            missingMentorFields: [],
            missingMenteeFields: [],
            canCreateRequest: false,
          },
        };
      }

      const missingSharedFields = [];
      const missingMentorFields = [];
      const missingMenteeFields = [];

      // Check shared required fields
      if (!profile.bio) missingSharedFields.push('bio');
      if (!profile.job_title) missingSharedFields.push('job_title');
      if (!profile.location) missingSharedFields.push('location');
      if (!profile.career_level_encrypted)
        missingSharedFields.push('career_level');
      if (!profile.company_encrypted) missingSharedFields.push('company');

      // Check mentor fields
      if (profile.is_active_mentor) {
        if (!profile.mentor_bio) missingMentorFields.push('mentor_bio');
        if (!profile.mentor_expertise?.length)
          missingMentorFields.push('expertise');
      }

      // Check mentee fields
      if (profile.is_active_mentee) {
        if (!profile.mentee_goals) missingMenteeFields.push('mentee_goals');
      }

      const canCreateRequest =
        missingSharedFields.length === 0 &&
        (!profile.is_active_mentor || missingMentorFields.length === 0) &&
        (!profile.is_active_mentee || missingMenteeFields.length === 0);

      return {
        success: true,
        data: {
          hasProfile: profile.is_active_mentor || profile.is_active_mentee,
          hasMentorProfile: profile.is_active_mentor,
          hasMenteeProfile: profile.is_active_mentee,
          missingSharedFields,
          missingMentorFields,
          missingMenteeFields,
          canCreateRequest,
        },
      };
    } catch (error) {
      console.error('Check profile requirement error:', error);
      return {
        success: true,
        data: {
          hasProfile: false,
          hasMentorProfile: false,
          hasMenteeProfile: false,
          missingSharedFields: ['all'],
          missingMentorFields: [],
          missingMenteeFields: [],
          canCreateRequest: false,
        },
      };
    }
  }

  async submitFeedback(userId: string, feedbackData: any) {
    try {
      // In a real implementation, you would save feedback to a database
      return {
        success: true,
        message: 'Feedback submitted successfully',
        data: {
          feedbackId: 'feedback_' + Date.now(),
          ...feedbackData,
        },
      };
    } catch (error) {
      console.error('Submit feedback error:', error);
      throw new BadRequestException('Failed to submit feedback');
    }
  }
}
