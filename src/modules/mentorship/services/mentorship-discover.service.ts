// modules/mentorship/services/mentorship-discover.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { MentorshipQueryDto } from '../dto/mentorship-query.dto';

@Injectable()
export class MentorshipDiscoverService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async discoverProfiles(currentUserId: string, query: MentorshipQueryDto) {
    try {
      console.log('=== DISCOVER PROFILES START ===');
      console.log('Current user ID:', currentUserId);
      console.log('Query:', query);

      const {
        viewMode = 'all',
        search,
        careerLevel,
        expertise,
        industries,
        affinityTags,
        availability,
        location,
        page = 1,
        limit = 20,
        sortBy = 'recent',
        sortOrder = 'desc',
      } = query;

      // Build the query
      let supabaseQuery = this.admin.from('user_profiles').select(
        `
      id,
      username,
      avatar,
      bio,
      job_title,
      location,
      years_experience,
      skills,
      mentor_bio,
      mentor_expertise,
      mentor_industries,
      mentor_availability,
      mentor_response_time,
      mentor_style,
      mentor_languages,
      is_active_mentor,
      is_willing_to_mentor,
      mentee_bio,
      mentee_goals,
      mentee_interests,
      mentee_industries,
      mentee_availability,
      mentee_urgency,
      mentee_topic,
      is_active_mentee,
      mentoring_as,
      career_level_encrypted,
      affinity_tags_encrypted,
      company_encrypted,
      reputation_score,
      mentorship_sessions_completed, 
      created_at,
      updated_at
    `,
        { count: 'exact' },
      );

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
      console.log('Excluding current user:', currentUserId);
      supabaseQuery = supabaseQuery.neq('id', currentUserId);

      // Search filter
      if (search) {
        console.log('Search filter:', search);
        supabaseQuery = supabaseQuery.or(
          `username.ilike.%${search}%,bio.ilike.%${search}%,mentor_bio.ilike.%${search}%,job_title.ilike.%${search}%`,
        );
      }

      // Array filters
      if (expertise?.length) {
        console.log('Expertise filter:', expertise);
        supabaseQuery = supabaseQuery.overlaps('mentor_expertise', expertise);
      }

      if (industries?.length) {
        console.log('Industries filter:', industries);
        supabaseQuery = supabaseQuery.overlaps('mentor_industries', industries);
      }

      // Location filter
      if (location) {
        console.log('Location filter:', location);
        supabaseQuery = supabaseQuery.ilike('location', `%${location}%`);
      }

      // Availability filter
      if (availability && availability !== 'all') {
        console.log('Availability filter:', availability);
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
      console.log('Sort by:', sortBy, 'Order:', sortOrder);
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
      console.log('Pagination: from', from, 'to', to);

      // Apply pagination
      supabaseQuery = supabaseQuery.range(from, to);

      console.log('Executing Supabase query...');
      const { data: profiles, error, count } = await supabaseQuery;

      if (error) {
        console.error('Supabase error:', error);
        throw new BadRequestException('Failed to discover profiles');
      }

      console.log('Raw profiles found:', profiles?.length || 0);
      console.log('Raw profiles:', JSON.stringify(profiles, null, 2));

      // Get bookmarks for current user
      const { data: bookmarks } = await this.admin
        .from('mentorship_bookmarks')
        .select('bookmarked_user_id')
        .eq('user_id', currentUserId);

      const bookmarkedIds = bookmarks?.map((b) => b.bookmarked_user_id) || [];

      // Apply encrypted field filters and enhance profiles
      const enhancedProfiles = (profiles || [])
        .filter((profile) => {
          console.log(
            `Profile ${profile.id} - mentoring_as: ${profile.mentoring_as}, is_willing_to_mentor: ${profile.is_willing_to_mentor}`,
          );

          // Career level filter (in memory since field is encrypted)
          if (careerLevel?.length) {
            if (!profile.career_level_encrypted) return false;
            const hasMatchingCareerLevel = careerLevel.some((level) =>
              profile.career_level_encrypted.includes(level),
            );
            if (!hasMatchingCareerLevel) return false;
          }

          // Affinity tags filter
          if (affinityTags?.length) {
            if (!profile.affinity_tags_encrypted) return false;
            try {
              const tags = JSON.parse(profile.affinity_tags_encrypted);
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
        .map((profile) => {
          let affinityTagsArray = [];
          if (profile.affinity_tags_encrypted) {
            try {
              affinityTagsArray = JSON.parse(profile.affinity_tags_encrypted);
            } catch (e) {
              affinityTagsArray = [];
            }
          }

          return {
            ...profile,
            career_level: profile.career_level_encrypted,
            affinity_tags: affinityTagsArray,
            isBookmarked: bookmarkedIds.includes(profile.id),
            matchScore: this.calculateMatchScore(profile, currentUserId, query),
          };
        });

      console.log(
        'Enhanced profiles after filtering:',
        enhancedProfiles.length,
      );

      // Re-sort by match score if requested
      if (sortBy === 'match_score') {
        enhancedProfiles.sort((a, b) => {
          return sortOrder === 'asc'
            ? a.matchScore - b.matchScore
            : b.matchScore - a.matchScore;
        });
      }

      console.log('=== DISCOVER PROFILES END ===');

      // FIX: Return directly without double nesting
      return {
        success: true,
        profiles: enhancedProfiles,
        total: enhancedProfiles.length,
        page,
        limit,
        totalPages: Math.ceil(enhancedProfiles.length / limit),
      };
    } catch (error) {
      console.error('Error in discoverProfiles:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to discover profiles');
    }
  }

  async getSuggestions(
    currentUserId: string,
    type: string,
    limit: number = 10,
  ) {
    try {
      // Get current user profile
      const { data: currentUser } = await this.admin
        .from('user_profiles')
        .select(
          'mentor_expertise, mentor_industries, location, mentee_interests, career_level_encrypted, is_willing_to_mentor, mentoring_as',
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
          is_willing_to_mentor
        `,
        )
        .neq('id', currentUserId)
        .limit(limit);

      if (type === 'mentors') {
        query = query.eq('is_willing_to_mentor', true);
      } else if (type === 'mentees') {
        query = query.or('mentoring_as.eq.mentee,mentoring_as.eq.both');
      }

      const { data: profiles, error } = await query;

      if (error) {
        console.error('Suggestions error:', error);
        throw new BadRequestException('Failed to get suggestions');
      }

      // Calculate match scores and sort
      const scoredProfiles =
        profiles
          ?.map((profile) => {
            let affinityTags = [];
            if (profile.affinity_tags_encrypted) {
              try {
                affinityTags = JSON.parse(profile.affinity_tags_encrypted);
              } catch (e) {
                affinityTags = [];
              }
            }

            return {
              ...profile,
              career_level: profile.career_level_encrypted,
              affinity_tags: affinityTags,
              matchScore: this.calculateSuggestionScore(profile, currentUser),
            };
          })
          .sort((a, b) => b.matchScore - a.matchScore) || [];

      return {
        success: true,
        data: scoredProfiles,
      };
    } catch (error) {
      console.error('Error in getSuggestions:', error);
      throw new BadRequestException('Failed to get suggestions');
    }
  }

  async getFilterOptions() {
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
          'Black Women in Tech',
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
      },
    };
  }

  private calculateMatchScore(
    profile: any,
    currentUserId: string,
    query: MentorshipQueryDto,
  ): number {
    let score = 50;

    // Add points for expertise match
    if (query.expertise?.length && profile.mentor_expertise) {
      const matchingExpertise = profile.mentor_expertise.filter((exp: string) =>
        query.expertise?.includes(exp),
      );
      score += matchingExpertise.length * 10;
    }

    // Add points for industry match
    if (query.industries?.length && profile.mentor_industries) {
      const matchingIndustries = profile.mentor_industries.filter(
        (ind: string) => query.industries?.includes(ind),
      );
      score += matchingIndustries.length * 8;
    }

    // Add points for reputation
    if (profile.reputation_score) {
      score += Math.min(profile.reputation_score / 10, 20);
    }

    // Add points for experience
    if (profile.years_experience) {
      score += Math.min(profile.years_experience, 20);
    }

    // Add points for response time
    if (profile.mentor_response_time) {
      if (profile.mentor_response_time.includes('24 hours')) score += 15;
      else if (profile.mentor_response_time.includes('48 hours')) score += 10;
      else if (profile.mentor_response_time.includes('week')) score += 5;
    }

    return Math.min(score, 100);
  }

  private calculateSuggestionScore(profile: any, currentUser: any): number {
    let score = 50;

    // Expertise match
    if (currentUser.mentor_expertise && profile.mentor_expertise) {
      const commonExpertise = currentUser.mentor_expertise.filter(
        (exp: string) => profile.mentor_expertise.includes(exp),
      );
      score += commonExpertise.length * 15;
    }

    // Industry match
    if (currentUser.mentor_industries && profile.mentor_industries) {
      const commonIndustries = currentUser.mentor_industries.filter(
        (ind: string) => profile.mentor_industries.includes(ind),
      );
      score += commonIndustries.length * 10;
    }

    // Location match
    if (
      currentUser.location &&
      profile.location &&
      currentUser.location === profile.location
    ) {
      score += 20;
    }

    // Career level compatibility
    if (currentUser.career_level_encrypted && profile.career_level_encrypted) {
      const currentLevel = this.parseCareerLevel(
        currentUser.career_level_encrypted,
      );
      const profileLevel = this.parseCareerLevel(
        profile.career_level_encrypted,
      );

      if (currentLevel < profileLevel) {
        score += 15;
      } else if (currentLevel > profileLevel) {
        score += 5;
      }
    }

    return Math.min(score, 100);
  }

  private parseCareerLevel(level: string): number {
    if (level.includes('Entry') || level.includes('0-2')) return 1;
    if (level.includes('Mid') || level.includes('3-7')) return 2;
    if (level.includes('Senior') || level.includes('8-12')) return 3;
    if (level.includes('Executive') || level.includes('C-Suite')) return 4;
    return 0;
  }
}
