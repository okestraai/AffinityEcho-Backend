import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { UnifiedProfileEditDto } from '../dto/unified-profile-edit.dto';
import { MSG } from '../../../common/constants/messages';
import { CompaniesService } from '../../companies/companies.service';
import {
  ETHNICITY_SEPARATOR,
  isReservedSpaceName,
  splitEthnicities,
  titleCaseWords,
} from '../../../common/constants/onboarding-options';

@Injectable()
export class UnifiedProfileService {
  private admin;
  private readonly logger = new Logger(UnifiedProfileService.name);

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
    private companies: CompaniesService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // ============ HELPER METHODS ============

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
      // Handle double-stringified case: stored as encrypt(JSON.stringify(JSON.stringify(array)))
      if (typeof parsed === 'string') {
        return JSON.parse(parsed);
      }
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

  // ============ GET EDITABLE PROFILE ============

  async getEditableProfile(userId: string) {
    this.logger.log(`Fetching editable profile for user ${userId}`);

    try {
      const { data: profile, error } = await this.admin
        .from('user_profiles')
        .select(
          `
          username, avatar, bio, job_title, location, years_experience, skills, linkedin_url,
          first_name_encrypted, last_name_encrypted,
          company_encrypted, company_type, is_company_verified,
          career_level_encrypted, race_encrypted, gender_encrypted, affinity_tags_encrypted,
          privacy_level, show_company, show_location, show_email, show_activity, show_connections,
          profile_visibility, allow_messages_from,
          is_active_mentor, is_willing_to_mentor, mentor_bio, mentor_expertise, mentor_industries,
          mentor_availability, mentor_response_time, mentor_style, mentor_languages, mentor_hourly_rate,
          is_active_mentee, mentee_bio, mentee_goals, mentee_interests, mentee_industries,
          mentee_availability, mentee_urgency, mentee_topic, mentored_style, mentee_languages,
          communication_method,
          country_code, is_student, school_encrypted, expected_grad_year, show_school
        `,
        )
        .eq('id', userId)
        .single();

      if (error || !profile) {
        this.logger.warn(
          `Profile not found for user ${userId}`,
          error?.message,
        );
        throw new NotFoundException(MSG.USER.NOT_FOUND);
      }

      return {
        success: true,
        data: {
          basic: {
            first_name: this.decryptField(profile.first_name_encrypted),
            last_name: this.decryptField(profile.last_name_encrypted),
            username: profile.username,
            avatar: profile.avatar,
            bio: profile.bio,
            job_title: profile.job_title,
            location: profile.location,
            years_experience: profile.years_experience,
            skills: profile.skills || [],
            country_code: profile.country_code ?? null,
          },
          school: {
            is_student: !!profile.is_student,
            school_name: this.decryptField(profile.school_encrypted),
            expected_grad_year: profile.expected_grad_year ?? null,
            show_school: !!profile.show_school,
          },
          company: {
            company_name: this.decryptField(profile.company_encrypted),
            is_company_verified: profile.is_company_verified || false,
          },
          identity: {
            career_level: this.decryptField(profile.career_level_encrypted),
            race: this.decryptField(profile.race_encrypted),
            ethnicities: splitEthnicities(
              this.decryptField(profile.race_encrypted),
            ),
            gender: this.decryptField(profile.gender_encrypted),
            affinity_tags: this.decryptAffinityTags(
              profile.affinity_tags_encrypted,
            ),
          },
          mentor: profile.is_active_mentor
            ? {
                mentor_bio: profile.mentor_bio,
                expertise: profile.mentor_expertise || [],
                industries: profile.mentor_industries || [],
                availability: profile.mentor_availability,
                response_time: profile.mentor_response_time,
                mentoring_style: profile.mentor_style,
                languages: profile.mentor_languages || [],
                hourly_rate: profile.mentor_hourly_rate,
              }
            : null,
          mentee: profile.is_active_mentee
            ? {
                mentee_bio: profile.mentee_bio,
                goals: profile.mentee_goals,
                interests: profile.mentee_interests || [],
                industries: profile.mentee_industries || [],
                availability: profile.mentee_availability,
                urgency: profile.mentee_urgency,
                topic: profile.mentee_topic,
                mentored_style: profile.mentored_style,
                languages: profile.mentee_languages || [],
                communication_method: profile.communication_method,
              }
            : null,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(MSG.USER.PROFILE_FAILED, error);
      throw new BadRequestException(MSG.USER.PROFILE_FAILED);
    }
  }

  // Turning student off keeps the school as a past school; turning it on needs a school name.
  private async applySchool(
    userId: string,
    school: NonNullable<UnifiedProfileEditDto['school']>,
    updateData: Record<string, unknown>,
  ) {
    const { data: current } = await this.admin
      .from('user_profiles')
      .select('is_student, school_encrypted')
      .eq('id', userId)
      .single();
    const willBeStudent = school.is_student ?? !!current?.is_student;

    // A school is only saved for someone who is (or is becoming) a student.
    if (school.school_name != null && willBeStudent) {
      const name = titleCaseWords(school.school_name);
      if (name.length < 2) {
        throw new BadRequestException('Add your school or university');
      }
      if (isReservedSpaceName(name)) {
        throw new BadRequestException(
          `"${name}" can't be used as a school name`,
        );
      }
      updateData.school_encrypted = this.encryption.encrypt(name);
    }
    if (willBeStudent) {
      if (!updateData.school_encrypted && !current?.school_encrypted) {
        throw new BadRequestException('Add your school or university');
      }
      updateData.is_student = true;
    } else if (school.is_student === false && current?.is_student) {
      updateData.is_student = false;
      updateData.school_alumni_encrypted =
        updateData.school_encrypted ?? current.school_encrypted;
      updateData.school_encrypted = null;
      updateData.expected_grad_year = null;
    }
    if (school.expected_grad_year !== undefined) {
      updateData.expected_grad_year = willBeStudent
        ? school.expected_grad_year
        : null;
    }
    if (school.show_school !== undefined) {
      updateData.show_school = school.show_school;
    }
  }

  async dismissCountryPrompt(userId: string) {
    const { error } = await this.admin
      .from('user_profiles')
      .update({ country_prompt_dismissed_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw new BadRequestException(MSG.USER.PROFILE_FAILED);
    return { dismissed: true };
  }

  // ============ UPDATE PROFILE ============

  async updateProfile(userId: string, dto: UnifiedProfileEditDto) {
    this.logger.log(`Updating profile for user ${userId}`);

    try {
      const updateData: any = { updated_at: new Date().toISOString() };

      // ---- BASIC SECTION ----
      if (dto.basic) {
        if (dto.basic.first_name !== undefined) {
          updateData.first_name_encrypted = this.encryption.encrypt(
            dto.basic.first_name,
          );
        }
        if (dto.basic.last_name !== undefined) {
          updateData.last_name_encrypted = this.encryption.encrypt(
            dto.basic.last_name,
          );
        }
        if (dto.basic.username !== undefined) {
          // Validate username uniqueness
          const { data: existing } = await this.admin
            .from('user_profiles')
            .select('id')
            .eq('username', dto.basic.username)
            .neq('id', userId)
            .single();
          if (existing) {
            throw new BadRequestException(MSG.USER.USERNAME_TAKEN);
          }
          updateData.username = dto.basic.username;
        }
        if (dto.basic.avatar !== undefined)
          updateData.avatar = dto.basic.avatar;
        if (dto.basic.bio !== undefined) updateData.bio = dto.basic.bio;
        if (dto.basic.job_title !== undefined)
          updateData.job_title = dto.basic.job_title;
        if (dto.basic.location !== undefined)
          updateData.location = dto.basic.location;
        if (dto.basic.years_experience !== undefined)
          updateData.years_experience = dto.basic.years_experience;
        if (dto.basic.skills !== undefined)
          updateData.skills = dto.basic.skills;
        if (dto.basic.country_code)
          updateData.country_code = dto.basic.country_code;
      }

      // ---- SCHOOL SECTION ----
      if (dto.school) {
        await this.applySchool(userId, dto.school, updateData);
      }

      // ---- COMPANY SECTION (with alumni logic) ----
      if (dto.company) {
        if (dto.company.company_name !== undefined) {
          // Fetch current profile to get existing company and alumni
          const { data: currentProfile } = await this.admin
            .from('user_profiles')
            .select('company_encrypted, company_alumni_encrypted')
            .eq('id', userId)
            .single();

          const currentCompany = this.decryptField(
            currentProfile?.company_encrypted,
          );
          // An empty name removes the company; any other name is checked against the list.
          const typed = (dto.company.company_name ?? '').trim();
          const resolved = typed ? await this.companies.resolve(typed) : null;
          const newCompany = resolved?.name ?? '';

          if (
            currentCompany &&
            currentCompany.toLowerCase() !== newCompany.toLowerCase()
          ) {
            // Move old company to alumni
            const existingAlumni: string[] =
              currentProfile?.company_alumni_encrypted || [];

            // Decrypt all alumni to check for duplicates
            const decryptedAlumni = existingAlumni
              .map((a) => this.decryptField(a))
              .filter(Boolean) as string[];

            // Remove new company from alumni if it was there (user returning to old company)
            const filteredAlumni = existingAlumni.filter(
              (_, i) =>
                decryptedAlumni[i]?.toLowerCase() !== newCompany.toLowerCase(),
            );

            // Add old company to alumni if not already there
            if (
              !decryptedAlumni.some(
                (a) => a.toLowerCase() === currentCompany.toLowerCase(),
              )
            ) {
              filteredAlumni.push(this.encryption.encrypt(currentCompany));
            }

            updateData.company_alumni_encrypted = filteredAlumni;

            // Reset company verification
            updateData.is_company_verified = false;
            updateData.company_verified_at = null;

            // Delete pending verification tokens
            await this.admin
              .from('company_verification_tokens')
              .delete()
              .eq('user_id', userId)
              .is('used_at', null);
          }

          if (resolved) {
            Object.assign(updateData, resolved.columns);
          } else {
            updateData.company_encrypted = null;
            updateData.company_type = null;
            updateData.company_key = null;
          }
        }
      }

      // ---- IDENTITY SECTION ----
      if (dto.identity) {
        if (dto.identity.career_level !== undefined) {
          updateData.career_level_encrypted = this.encryption.encrypt(
            dto.identity.career_level,
          );
        }
        if (dto.identity.ethnicities !== undefined) {
          const chosen = [
            ...new Set(
              dto.identity.ethnicities.map((e) => e.trim()).filter(Boolean),
            ),
          ];
          updateData.race_encrypted = chosen.length
            ? this.encryption.encrypt(chosen.join(ETHNICITY_SEPARATOR))
            : null;
        } else if (dto.identity.race !== undefined) {
          updateData.race_encrypted = this.encryption.encrypt(
            dto.identity.race,
          );
        }
        if (dto.identity.gender !== undefined) {
          updateData.gender_encrypted = this.encryption.encrypt(
            dto.identity.gender,
          );
        }
        if (dto.identity.affinity_tags !== undefined) {
          updateData.affinity_tags_encrypted = this.encryption.encrypt(
            JSON.stringify(dto.identity.affinity_tags),
          );
        }
      }

      // ---- MENTOR SECTION ----
      if (dto.mentor) {
        if (dto.mentor.mentor_bio !== undefined)
          updateData.mentor_bio = dto.mentor.mentor_bio;
        if (dto.mentor.expertise !== undefined)
          updateData.mentor_expertise = dto.mentor.expertise;
        if (dto.mentor.industries !== undefined)
          updateData.mentor_industries = dto.mentor.industries;
        if (dto.mentor.availability !== undefined)
          updateData.mentor_availability = dto.mentor.availability;
        if (dto.mentor.response_time !== undefined)
          updateData.mentor_response_time = dto.mentor.response_time;
        if (dto.mentor.mentoring_style !== undefined)
          updateData.mentor_style = dto.mentor.mentoring_style;
        if (dto.mentor.languages !== undefined)
          updateData.mentor_languages = dto.mentor.languages;
        if (dto.mentor.hourly_rate !== undefined)
          updateData.mentor_hourly_rate = dto.mentor.hourly_rate;
      }

      // ---- MENTEE SECTION ----
      if (dto.mentee) {
        if (dto.mentee.mentee_bio !== undefined)
          updateData.mentee_bio = dto.mentee.mentee_bio;
        if (dto.mentee.goals !== undefined)
          updateData.mentee_goals = dto.mentee.goals;
        if (dto.mentee.interests !== undefined)
          updateData.mentee_interests = dto.mentee.interests;
        if (dto.mentee.industries !== undefined)
          updateData.mentee_industries = dto.mentee.industries;
        if (dto.mentee.availability !== undefined)
          updateData.mentee_availability = dto.mentee.availability;
        if (dto.mentee.urgency !== undefined)
          updateData.mentee_urgency = dto.mentee.urgency;
        if (dto.mentee.topic !== undefined)
          updateData.mentee_topic = dto.mentee.topic;
        if (dto.mentee.mentored_style !== undefined)
          updateData.mentored_style = dto.mentee.mentored_style;
        if (dto.mentee.languages !== undefined)
          updateData.mentee_languages = dto.mentee.languages;
        if (dto.mentee.communication_method !== undefined)
          updateData.communication_method = dto.mentee.communication_method;
      }

      // ---- EXECUTE UPDATE ----
      const { error } = await this.admin
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        this.logger.error(MSG.AUTH.PROFILE_UPDATE_FAILED, error.message);
        throw new BadRequestException(MSG.AUTH.PROFILE_UPDATE_FAILED);
      }

      return this.getEditableProfile(userId);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(MSG.AUTH.PROFILE_UPDATE_FAILED, error);
      throw new BadRequestException(MSG.AUTH.PROFILE_UPDATE_FAILED);
    }
  }
}
