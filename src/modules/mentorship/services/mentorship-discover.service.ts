// modules/mentorship/services/mentorship-discover.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { supabaseAdmin } from '../../../database/supabase.client';
import { MentorshipQueryDto } from '../dto/mentorship-query.dto';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class MentorshipDiscoverService {
  private admin;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async discoverProfiles(currentUserId: string, query: MentorshipQueryDto) {
    try {
      // Fetch existing mentorship pairs to exclude + current user's profile
      const [
        existingRequests,
        existingRelationships,
        { data: currentUserProfile },
      ] = await Promise.all([
        this.admin
          .from('mentorship_direct_requests')
          .select('requester_id, target_user_id')
          .eq('status', 'accepted')
          .or(
            `requester_id.eq.${currentUserId},target_user_id.eq.${currentUserId}`,
          ),
        this.admin
          .from('mentorship_relationships')
          .select('mentor_id, mentee_id')
          .eq('status', 'active')
          .or(`mentor_id.eq.${currentUserId},mentee_id.eq.${currentUserId}`),
        this.admin
          .from('user_profiles')
          .select(
            'mentor_expertise, mentor_industries, location, career_level_encrypted, affinity_tags_encrypted',
          )
          .eq('id', currentUserId)
          .single(),
      ]);

      const excludeIds = new Set<string>();
      (existingRequests.data || []).forEach((r: any) => {
        excludeIds.add(
          r.requester_id === currentUserId ? r.target_user_id : r.requester_id,
        );
      });
      (existingRelationships.data || []).forEach((r: any) => {
        excludeIds.add(
          r.mentor_id === currentUserId ? r.mentee_id : r.mentor_id,
        );
      });

      const cacheKey = `mentorship:discover:${currentUserId}:${JSON.stringify(query)}:exclude:${[...excludeIds].sort().join(',')}`;
      const cached = await this.redis.get<any>(cacheKey);
      if (cached) return cached;

      const {
        viewMode = 'all',
        search,
        careerLevel,
        expertise,
        industries,
        affinityTags,
        availability,
        location,
        languages,
        page = 1,
        limit = 20,
        sortBy = 'recent',
        sortOrder = 'desc',
      } = query;

      // OPTIMIZATION: Select only fields needed for list view (not detail view)
      let supabaseQuery = this.admin
        .from('user_profiles')
        .select(
          `
      id,
      username,
      avatar,
      bio,
      job_title,
      location,
      years_experience,
      mentor_expertise,
      mentor_industries,
      mentor_availability,
      mentor_response_time,
      mentor_languages,
      is_active_mentor,
      is_active_mentee,
      mentoring_as,
      career_level_encrypted,
      affinity_tags_encrypted,
      reputation_score,
      mentorship_sessions_completed,
      first_name_encrypted,
      last_name_encrypted,
      is_company_verified
    `,
          { count: 'exact' },
        )
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .eq('has_completed_onboarding', true);

      // Apply view mode filters
      if (viewMode === 'mentors') {
        supabaseQuery = supabaseQuery.eq('is_active_mentor', true);
      } else if (viewMode === 'mentees') {
        supabaseQuery = supabaseQuery.eq('is_active_mentee', true);
      } else if (viewMode === 'all') {
        supabaseQuery = supabaseQuery.or(
          'is_active_mentor.eq.true,is_active_mentee.eq.true',
        );
      }

      // Exclude current user
      supabaseQuery = supabaseQuery.neq('id', currentUserId);

      // Exclude existing mentor-mentee pairs
      if (excludeIds.size > 0) {
        supabaseQuery = supabaseQuery.not(
          'id',
          'in',
          `(${Array.from(excludeIds).join(',')})`,
        );
      }

      // Search filter
      if (search) {
        supabaseQuery = supabaseQuery.or(
          `username.ilike.%${search}%,bio.ilike.%${search}%,mentor_bio.ilike.%${search}%,job_title.ilike.%${search}%`,
        );
      }

      // Array filters
      if (expertise?.length) {
        supabaseQuery = supabaseQuery.overlaps('mentor_expertise', expertise);
      }

      if (industries?.length) {
        supabaseQuery = supabaseQuery.overlaps('mentor_industries', industries);
      }

      if (languages?.length) {
        supabaseQuery = supabaseQuery.overlaps('mentor_languages', languages);
      }

      // Location filter
      if (location) {
        supabaseQuery = supabaseQuery.ilike('location', `%${location}%`);
      }

      // Availability filter
      if (availability && availability !== 'all') {
        const availabilityMap: Record<string, string> = {
          immediate: 'Immediate',
          within_week: 'Within 1 week',
          within_month: 'Within 1 month',
        };

        const mappedAvailability = availabilityMap[availability];
        if (mappedAvailability) {
          supabaseQuery = supabaseQuery.eq(
            'mentor_availability',
            mappedAvailability,
          );
        }
      }

      // Apply sorting
      if (sortBy === 'experience') {
        supabaseQuery = supabaseQuery.order('years_experience', {
          ascending: sortOrder === 'asc',
          nullsFirst: false,
        });
      } else if (sortBy === 'reputation') {
        supabaseQuery = supabaseQuery.order('reputation_score', {
          ascending: sortOrder === 'asc',
          nullsFirst: false,
        });
      } else {
        supabaseQuery = supabaseQuery.order('created_at', {
          ascending: sortOrder === 'asc',
          nullsFirst: false,
        });
      }

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Apply pagination
      supabaseQuery = supabaseQuery.range(from, to);

      // OPTIMIZATION: Parallel fetch profiles + bookmarks
      const [profilesResult, bookmarksResult] = await Promise.all([
        supabaseQuery,
        this.admin
          .from('mentorship_bookmarks')
          .select('bookmarked_user_id')
          .eq('user_id', currentUserId),
      ]);

      const { data: profiles, error, count } = profilesResult;

      if (error) {
        logger.error('Failed to discover profiles', {
          module: 'MentorshipDiscover',
          error,
        });
        throw new BadRequestException('Failed to discover profiles');
      }

      const bookmarks = bookmarksResult.data;
      const bookmarkedIds =
        bookmarks?.map((b: any) => b.bookmarked_user_id) || [];

      // Apply encrypted field filters and enhance profiles
      const enhancedProfiles = (profiles || [])
        .filter((profile: any) => {
          // Career level filter (in memory since field is encrypted)
          if (careerLevel?.length) {
            if (!profile.career_level_encrypted) return false;
            const decryptedLevel = this.decryptField(
              profile.career_level_encrypted,
            );
            const hasMatchingCareerLevel = careerLevel.some((level) =>
              decryptedLevel.includes(level),
            );
            if (!hasMatchingCareerLevel) return false;
          }

          // Affinity tags filter
          if (affinityTags?.length) {
            if (!profile.affinity_tags_encrypted) return false;
            try {
              let tags: string[];
              try {
                const decrypted = this.encryption.decrypt(
                  profile.affinity_tags_encrypted,
                );
                tags = JSON.parse(decrypted);
              } catch {
                tags = JSON.parse(profile.affinity_tags_encrypted);
              }
              const hasMatchingTag = affinityTags.some((tag) =>
                tags.includes(tag),
              );
              if (!hasMatchingTag) return false;
            } catch {
              return false;
            }
          }

          return true;
        })
        .map((profile: any) => {
          let affinityTagsArray: string[] = [];
          if (profile.affinity_tags_encrypted) {
            try {
              const decrypted = this.encryption.decrypt(
                profile.affinity_tags_encrypted,
              );
              affinityTagsArray = JSON.parse(decrypted);
            } catch {
              try {
                affinityTagsArray = JSON.parse(profile.affinity_tags_encrypted);
              } catch {
                affinityTagsArray = [];
              }
            }
          }

          return {
            ...profile,
            career_level: this.decryptField(profile.career_level_encrypted),
            affinity_tags: affinityTagsArray,
            isBookmarked: bookmarkedIds.includes(profile.id),
            matchScore: this.calculateMatchScore(
              profile,
              currentUserId,
              currentUserProfile,
            ),
          };
        });

      // Apply identity reveal — show real name for revealed users
      const profileIds = enhancedProfiles
        .map((p: any) => p.id)
        .filter((id: string) => id !== currentUserId);
      const revealedIds = await this.identityReveal.getRevealedUserIds(
        currentUserId,
        profileIds,
      );

      enhancedProfiles.forEach((profile: any) => {
        if (revealedIds.has(profile.id)) {
          const realName = this.identityReveal.decryptRealName(
            profile.first_name_encrypted,
            profile.last_name_encrypted,
          );
          if (realName) {
            profile.display_name = realName;
          }
        }
        // Clean up encrypted fields
        delete profile.first_name_encrypted;
        delete profile.last_name_encrypted;
        delete profile.affinity_tags_encrypted;
        delete profile.career_level_encrypted;
      });

      // Re-sort by match score if requested
      if (sortBy === 'match_score') {
        enhancedProfiles.sort((a: any, b: any) => {
          return sortOrder === 'asc'
            ? a.matchScore - b.matchScore
            : b.matchScore - a.matchScore;
        });
      }

      // Filter by match score range if specified
      let filteredProfiles = enhancedProfiles;
      if (
        query.minMatchScore !== undefined ||
        query.maxMatchScore !== undefined
      ) {
        filteredProfiles = enhancedProfiles.filter((p: any) => {
          if (
            query.minMatchScore !== undefined &&
            p.matchScore < query.minMatchScore
          )
            return false;
          if (
            query.maxMatchScore !== undefined &&
            p.matchScore > query.maxMatchScore
          )
            return false;
          return true;
        });
      }

      const effectiveTotal =
        filteredProfiles.length !== enhancedProfiles.length
          ? filteredProfiles.length
          : count || 0;

      const result = {
        success: true,
        profiles: filteredProfiles,
        total: effectiveTotal,
        page,
        limit,
        totalPages: Math.ceil(effectiveTotal / limit),
        metadata: {
          filteredCount: filteredProfiles.length,
          dbTotal: count || 0,
          note:
            count !== filteredProfiles.length
              ? 'Some results filtered by match score or privacy preferences'
              : undefined,
        },
      };

      await this.redis.set(cacheKey, result, 300000);

      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Error in discoverProfiles', {
        module: 'MentorshipDiscover',
        error,
      });
      throw new BadRequestException('Failed to discover profiles');
    }
  }

  async getSuggestions(
    currentUserId: string,
    type: string,
    limit: number = 10,
  ) {
    try {
      const cacheKey = `mentorship:suggestions:${currentUserId}:${type}:${limit}`;
      const cached = await this.redis.get<any>(cacheKey);
      if (cached) return cached;

      // Get current user profile
      const { data: currentUser } = await this.admin
        .from('user_profiles')
        .select(
          'mentor_expertise, mentor_industries, location, mentee_interests, career_level_encrypted, affinity_tags_encrypted, is_willing_to_mentor, mentoring_as',
        )
        .eq('id', currentUserId)
        .single();

      if (!currentUser) {
        throw new BadRequestException('User not found');
      }

      let query = this.admin
        .from('user_profiles')
        .select(
          `
          id,
          username,
          avatar,
          bio,
          job_title,
          location,
          years_experience,
          mentor_bio,
          mentor_expertise,
          mentor_industries,
          mentor_response_time,
          mentor_languages,
          mentoring_as,
          career_level_encrypted,
          affinity_tags_encrypted,
          reputation_score,
          is_willing_to_mentor,
          is_company_verified
        `,
        )
        .neq('id', currentUserId)
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .eq('has_completed_onboarding', true)
        .limit(limit);

      if (type === 'mentors') {
        query = query.eq('is_willing_to_mentor', true);
      } else if (type === 'mentees') {
        query = query.or('mentoring_as.eq.mentee,mentoring_as.eq.both');
      }

      const { data: profiles, error } = await query;

      if (error) {
        logger.error('Failed to get suggestions', {
          module: 'MentorshipDiscover',
          error,
        });
        throw new BadRequestException('Failed to get suggestions');
      }

      // Calculate match scores and sort
      const scoredProfiles =
        profiles
          ?.map((profile: any) => {
            let affinityTags: string[] = [];
            if (profile.affinity_tags_encrypted) {
              try {
                const decrypted = this.encryption.decrypt(
                  profile.affinity_tags_encrypted,
                );
                affinityTags = JSON.parse(decrypted);
              } catch {
                try {
                  affinityTags = JSON.parse(profile.affinity_tags_encrypted);
                } catch {
                  affinityTags = [];
                }
              }
            }

            return {
              ...profile,
              career_level: this.decryptField(profile.career_level_encrypted),
              affinity_tags: affinityTags,
              matchScore: this.calculateSuggestionScore(profile, currentUser),
            };
          })
          .sort((a: any, b: any) => b.matchScore - a.matchScore) || [];

      const result = {
        success: true,
        data: scoredProfiles,
      };

      await this.redis.set(cacheKey, result, 600000);

      return result;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error('Error in getSuggestions', {
        module: 'MentorshipDiscover',
        error,
      });
      throw new BadRequestException('Failed to get suggestions');
    }
  }

  async getFilterOptions() {
    return this.redis.getOrSet('mentorship:filters', 3600000, async () => {
      return {
        success: true,
        data: {
          careerLevels: [
            'Entry Level (0-2 years)',
            'Mid-level (3-7 years)',
            'Senior (8-12 years)',
            'Leadership (13+ years)',
            'Executive/C-Suite',
          ],
          expertiseAreas: [
            'Technical Leadership',
            'Career Development',
            'Product Management',
            'Engineering Management',
            'Startup Founder',
            'Investor Relations',
            'Marketing Strategy',
            'Sales Leadership',
            'UX/UI Design',
            'Data Science',
            'Cloud Architecture',
            'DevOps',
            'Mobile Development',
            'Web Development',
            'AI/ML',
            'Entrepreneurship',
            'Workplace Navigation',
            'Interview Skills',
            'Engineering',
            'Finance',
            'Marketing',
          ],
          industries: [
            'Technology',
            'Finance',
            'Healthcare',
            'Education',
            'Retail',
            'Manufacturing',
            'Media & Entertainment',
            'Real Estate',
            'Transportation',
            'Energy',
            'Consulting',
            'Non-profit',
            'Government',
            'SaaS',
            'E-commerce',
          ],
          affinityTags: [
            'Black Professionals',
            'Latino Leaders',
            'Women in Leadership',
            'LGBTQ+ in Finance',
            'Asian Entrepreneurs',
            'First-Gen College Grads',
            'Working Parents',
            'Military Veterans',
            'Disabled Professionals',
            'Immigrant Professionals',
          ],
          availabilityOptions: [
            'Immediate',
            'Within 1 week',
            'Within 2 weeks',
            'Within 1 month',
            'Within 3 months',
          ],
          communicationMethods: [
            'video-calls',
            'phone-calls',
            'text-chat',
            'email',
          ],
          languages: [
            'English',
            'Spanish',
            'French',
            'German',
            'Russian',
            'Japanese',
          ],
          matchScoreRanges: [
            { label: 'Excellent (80-100)', min: 80, max: 100 },
            { label: 'Good (60-79)', min: 60, max: 79 },
            { label: 'Fair (40-59)', min: 40, max: 59 },
            { label: 'All', min: 0, max: 100 },
          ],
        },
      };
    });
  }

  private calculateMatchScore(
    profile: any,
    currentUserId: string,
    currentUser: any,
  ): number {
    let score = 0;

    // Expertise match — up to 30 points (most important for mentorship)
    if (
      currentUser?.mentor_expertise?.length &&
      profile.mentor_expertise?.length
    ) {
      const matchingExpertise = profile.mentor_expertise.filter((exp: string) =>
        currentUser.mentor_expertise.includes(exp),
      );
      score += Math.min(matchingExpertise.length * 10, 30);
    }

    // Industry match — up to 20 points
    if (
      currentUser?.mentor_industries?.length &&
      profile.mentor_industries?.length
    ) {
      const matchingIndustries = profile.mentor_industries.filter(
        (ind: string) => currentUser.mentor_industries.includes(ind),
      );
      score += Math.min(matchingIndustries.length * 7, 20);
    }

    // Affinity tag match — up to 15 points
    const currentTags = this.decryptTagsField(
      currentUser?.affinity_tags_encrypted,
    );
    const profileTags = this.decryptTagsField(profile.affinity_tags_encrypted);
    if (currentTags.length && profileTags.length) {
      const matchingTags = profileTags.filter((tag: string) =>
        currentTags.includes(tag),
      );
      score += Math.min(matchingTags.length * 8, 15);
    }

    // Career level compatibility — up to 15 points
    if (currentUser?.career_level_encrypted && profile.career_level_encrypted) {
      const currentLevel = this.parseCareerLevel(
        currentUser.career_level_encrypted,
      );
      const profileLevel = this.parseCareerLevel(
        profile.career_level_encrypted,
      );
      if (currentLevel > 0 && profileLevel > 0) {
        if (currentLevel < profileLevel) {
          score += 15; // Mentee seeking senior mentor
        } else if (currentLevel === profileLevel) {
          score += 10; // Peer mentoring
        } else {
          score += 5; // Reverse mentoring
        }
      }
    }

    // Location match — 10 points
    if (
      currentUser?.location &&
      profile.location &&
      currentUser.location.toLowerCase() === profile.location.toLowerCase()
    ) {
      score += 10;
    }

    // Activity indicators — up to 10 points
    let activityScore = 0;
    if (profile.reputation_score) {
      activityScore += Math.min(Math.floor(profile.reputation_score / 20), 3);
    }
    if (profile.years_experience) {
      activityScore += Math.min(Math.floor(profile.years_experience / 3), 3);
    }
    if (profile.mentor_response_time) {
      if (profile.mentor_response_time.includes('24 hours')) activityScore += 4;
      else if (profile.mentor_response_time.includes('48 hours'))
        activityScore += 3;
      else if (profile.mentor_response_time.includes('week'))
        activityScore += 2;
      else activityScore += 1;
    }
    score += Math.min(activityScore, 10);

    return Math.min(score, 100);
  }

  private calculateSuggestionScore(profile: any, currentUser: any): number {
    let score = 0;

    // Expertise match — up to 35 points (weighted higher for suggestions)
    if (
      currentUser.mentor_expertise?.length &&
      profile.mentor_expertise?.length
    ) {
      const commonExpertise = currentUser.mentor_expertise.filter(
        (exp: string) => profile.mentor_expertise.includes(exp),
      );
      score += Math.min(commonExpertise.length * 12, 35);
    }

    // Industry match — up to 25 points
    if (
      currentUser.mentor_industries?.length &&
      profile.mentor_industries?.length
    ) {
      const commonIndustries = currentUser.mentor_industries.filter(
        (ind: string) => profile.mentor_industries.includes(ind),
      );
      score += Math.min(commonIndustries.length * 8, 25);
    }

    // Affinity tag match — up to 15 points
    const suggCurrentTags = this.decryptTagsField(
      currentUser.affinity_tags_encrypted,
    );
    const suggProfileTags = this.decryptTagsField(
      profile.affinity_tags_encrypted,
    );
    if (suggCurrentTags.length && suggProfileTags.length) {
      const matchingTags = suggProfileTags.filter((tag: string) =>
        suggCurrentTags.includes(tag),
      );
      score += Math.min(matchingTags.length * 8, 15);
    }

    // Location match — 10 points
    if (
      currentUser.location &&
      profile.location &&
      currentUser.location.toLowerCase() === profile.location.toLowerCase()
    ) {
      score += 10;
    }

    // Career level compatibility — up to 15 points
    if (currentUser.career_level_encrypted && profile.career_level_encrypted) {
      const currentLevel = this.parseCareerLevel(
        currentUser.career_level_encrypted,
      );
      const profileLevel = this.parseCareerLevel(
        profile.career_level_encrypted,
      );
      if (currentLevel > 0 && profileLevel > 0) {
        if (currentLevel < profileLevel) {
          score += 15;
        } else if (currentLevel === profileLevel) {
          score += 10;
        } else {
          score += 5;
        }
      }
    }

    return Math.min(score, 100);
  }

  private decryptTagsField(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      const decrypted = this.encryption.decrypt(value);
      return JSON.parse(decrypted);
    } catch {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
  }

  private decryptField(value: string | null | undefined): string {
    if (!value) return '';
    try {
      return this.encryption.decrypt(value);
    } catch {
      return '';
    }
  }

  private parseCareerLevel(level: string): number {
    const decrypted = this.decryptField(level);
    if (decrypted.includes('Entry') || decrypted.includes('0-2')) return 1;
    if (decrypted.includes('Mid') || decrypted.includes('3-7')) return 2;
    if (decrypted.includes('Senior') || decrypted.includes('8-12')) return 3;
    if (decrypted.includes('Leadership') || decrypted.includes('13+')) return 4;
    if (decrypted.includes('Executive') || decrypted.includes('C-Suite'))
      return 5;
    return 0;
  }
}
