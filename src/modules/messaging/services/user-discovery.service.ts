// user-discovery.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class UserDiscoveryService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getConnectableUsers(
    userId: string,
    filters: {
      search?: string;
      limit?: number;
      offset?: number;
      exclude_existing?: boolean;
      role?: 'mentor' | 'mentee' | 'both';
      skills?: string[];
      company_type?: string;
    } = {},
  ) {
    try {
      const {
        search = '',
        limit = 20,
        offset = 0,
        exclude_existing = true,
        role,
        skills = [],
        company_type,
      } = filters;

      // Base query for users
      let query = this.admin
        .from('user_profiles')
        .select(
          `
          id,
          username,
          avatar,
          job_title,
          company_encrypted,
          bio,
          skills,
          location,
          years_experience,
          career_level_encrypted,
          mentoring_as,
          is_active_mentor,
          is_active_mentee,
          privacy_level,
          created_at,
          last_active_at
        `,
        )
        .neq('id', userId) // Exclude self
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .eq('has_completed_onboarding', true)
        .order('last_active_at', { ascending: false });

      // Apply search filter
      if (search) {
        query = query.or(
          `username.ilike.%${search}%,job_title.ilike.%${search}%,bio.ilike.%${search}%`,
        );
      }

      // Apply role filter
      if (role) {
        if (role === 'mentor') {
          query = query.eq('is_active_mentor', true);
        } else if (role === 'mentee') {
          query = query.eq('is_active_mentee', true);
        } else if (role === 'both') {
          query = query.or('is_active_mentor.eq.true,is_active_mentee.eq.true');
        }
      }

      // Apply skills filter
      if (skills.length > 0) {
        query = query.contains('skills', skills);
      }

      // Apply company type filter
      if (company_type) {
        query = query.eq('company_type', company_type);
      }

      // Get total count
      const { count, error: countError } = await query;
      if (countError) throw countError;

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data: users, error } = await query;
      if (error) throw error;

      // If excluding existing conversations, filter them out
      let filteredUsers = users;
      if (exclude_existing) {
        // Get all existing conversations for this user
        const { data: existingConversations, error: convError } =
          await this.admin
            .from('conversations')
            .select('user1_id, user2_id')
            .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
            .eq('is_active', true);

        if (!convError && existingConversations) {
          const existingUserIds = new Set();
          existingConversations.forEach((conv) => {
            if (conv.user1_id !== userId) existingUserIds.add(conv.user1_id);
            if (conv.user2_id !== userId) existingUserIds.add(conv.user2_id);
          });

          filteredUsers = users.filter((user) => !existingUserIds.has(user.id));
        }
      }

      // Get connection stats for each user
      const enhancedUsers = await Promise.all(
        filteredUsers.map(async (user) => {
          // Get mutual connections count
          const { count: mutualConnections } = await this.admin
            .from('user_follows')
            .select('*', { count: 'exact', head: true })
            .or(`follower_id.eq.${userId},following_id.eq.${userId}`)
            .or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);

          // Get common skills (if needed)
          const commonSkills = user.skills || [];

          return {
            ...user,
            mutual_connections: mutualConnections || 0,
            common_skills: commonSkills,
            can_message: true, // All public profiles can be messaged
          };
        }),
      );

      return {
        success: true,
        data: {
          users: enhancedUsers,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + limit < (count || 0),
          },
          filters_applied: filters,
        },
      };
    } catch (error) {
      logger.error('Failed to get connectable users', { error, userId });
      throw new BadRequestException('Failed to get connectable users');
    }
  }

  async getUserSuggestions(userId: string, limit: number = 10) {
    try {
      // Get user's profile to make better suggestions
      const { data: currentUser } = await this.admin
        .from('user_profiles')
        .select('skills, job_title, company_type, mentoring_as')
        .eq('id', userId)
        .single();

      // Get suggestions based on:
      // 1. Similar skills
      // 2. Same company type
      // 3. Complementary mentoring roles
      // 4. Recent activity

      let query = this.admin
        .from('user_profiles')
        .select(
          `
          id,
          username,
          avatar,
          job_title,
          company_encrypted,
          skills,
          mentoring_as,
          is_active_mentor,
          is_active_mentee,
          last_active_at
        `,
        )
        .neq('id', userId)
        .eq('privacy_level', 'public')
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .eq('has_completed_onboarding', true)
        .order('last_active_at', { ascending: false })
        .limit(limit);

      // Filter out existing conversations
      const { data: existingConversations } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('is_active', true);

      if (existingConversations && existingConversations.length > 0) {
        const existingUserIds = existingConversations.map((conv) =>
          conv.user1_id === userId ? conv.user2_id : conv.user1_id,
        );
        if (existingUserIds.length > 0) {
          query = query.not('id', 'in', `(${existingUserIds.join(',')})`);
        }
      }

      // Apply skill matching if user has skills
      if (currentUser?.skills && currentUser.skills.length > 0) {
        query = query.overlaps('skills', currentUser.skills);
      }

      // Apply complementary mentoring role
      if (currentUser?.mentoring_as) {
        if (currentUser.mentoring_as === 'mentor') {
          query = query.eq('is_active_mentee', true);
        } else if (currentUser.mentoring_as === 'mentee') {
          query = query.eq('is_active_mentor', true);
        }
      }

      const { data: suggestions, error } = await query;
      if (error) throw error;

      return {
        success: true,
        data: {
          suggestions,
          based_on: {
            skills: currentUser?.skills || [],
            mentoring_role: currentUser?.mentoring_as,
          },
        },
      };
    } catch (error) {
      logger.error('Failed to get user suggestions', { error, userId });
      // Don't throw error, return empty suggestions
      return {
        success: true,
        data: {
          suggestions: [],
          based_on: {},
        },
      };
    }
  }
}
