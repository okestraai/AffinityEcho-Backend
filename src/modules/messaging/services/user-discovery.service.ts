// user-discovery.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import logger from '../../../common/utils/logger.util';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class UserDiscoveryService {
  private admin;

  constructor(
    private config: ConfigService,
    private encryption: EncryptionUtil,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Search users by username prefix for @mention autocomplete.
   * Excludes self, deleted, deactivated, not-onboarded, and blocked users.
   */
  async search(userId: string, searchTerm: string, limit: number = 5) {
    try {
      if (!searchTerm || searchTerm.trim().length === 0) {
        return { success: true, data: { users: [] } };
      }

      const term = searchTerm.trim().toLowerCase();

      // Get blocked user IDs (bidirectional)
      const { data: blocks } = await this.admin
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      const blockedIds = new Set<string>();
      (blocks || []).forEach((b: any) => {
        if (b.blocker_id === userId) blockedIds.add(b.blocked_id);
        if (b.blocked_id === userId) blockedIds.add(b.blocker_id);
      });

      const query = this.admin
        .from('user_profiles')
        .select('id, username, avatar, is_company_verified')
        .neq('id', userId)
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .eq('has_completed_onboarding', true)
        .ilike('username', `${term}%`)
        .order('username', { ascending: true })
        .limit(limit + blockedIds.size); // over-fetch to compensate for block filtering

      const { data: users, error } = await query;
      if (error) throw error;

      // Filter out blocked users and limit
      const filtered = (users || [])
        .filter((u: any) => !blockedIds.has(u.id))
        .slice(0, limit)
        .map((u: any) => ({
          id: u.id,
          username: u.username,
          display_name: 'Anonymous User',
          avatar_emoji: u.avatar || 'User',
        }));

      return {
        success: true,
        data: { users: filtered },
      };
    } catch (error) {
      logger.error(MSG.USER.SEARCH_FAILED, { error, userId });
      throw new BadRequestException(MSG.USER.SEARCH_FAILED);
    }
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
          is_company_verified,
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

      // Get blocked user IDs (bidirectional)
      const { data: blocks } = await this.admin
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      const blockedIds = new Set<string>();
      (blocks || []).forEach((b: any) => {
        if (b.blocker_id === userId) blockedIds.add(b.blocked_id);
        if (b.blocked_id === userId) blockedIds.add(b.blocker_id);
      });

      // Filter out blocked users
      let filteredUsers = (users || []).filter(
        (u: any) => !blockedIds.has(u.id),
      );

      // If excluding existing conversations, filter them out
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
          existingConversations.forEach((conv: any) => {
            if (conv.user1_id !== userId) existingUserIds.add(conv.user1_id);
            if (conv.user2_id !== userId) existingUserIds.add(conv.user2_id);
          });

          filteredUsers = filteredUsers.filter(
            (user: any) => !existingUserIds.has(user.id),
          );
        }
      }

      // Batch fetch all follows for current user — 1 query instead of N
      const userIds = filteredUsers.map((u: any) => u.id);
      const { data: myFollows } = await this.admin
        .from('user_follows')
        .select('follower_id, following_id')
        .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

      // Build sets for O(1) lookup
      const iFollow = new Set<string>();
      const followMe = new Set<string>();
      for (const f of myFollows ?? []) {
        if (f.follower_id === userId) iFollow.add(f.following_id);
        if (f.following_id === userId) followMe.add(f.follower_id);
      }

      const enhancedUsers = filteredUsers.map((user: any) => {
        // Mutual = I follow them AND they follow me
        const mutual = (iFollow.has(user.id) ? 1 : 0) + (followMe.has(user.id) ? 1 : 0);
        const commonSkills = user.skills || [];

        let company = null;
        let careerLevel = null;
        try {
          if (user.company_encrypted)
            company = this.encryption.decrypt(user.company_encrypted);
          if (user.career_level_encrypted)
            careerLevel = this.encryption.decrypt(user.career_level_encrypted);
        } catch {
          // ignore decryption errors
        }

        const { company_encrypted, career_level_encrypted, ...rest } = user;

        return {
          ...rest,
          company,
          career_level: careerLevel,
          mutual_connections: mutual,
          common_skills: commonSkills,
          can_message: true,
        };
      });

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
      logger.error(MSG.USER.CONNECTABLE_FAILED, { error, userId });
      throw new BadRequestException(MSG.USER.CONNECTABLE_FAILED);
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
        const existingUserIds = existingConversations.map((conv: any) =>
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
