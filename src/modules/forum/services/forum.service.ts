import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { CreateForumDto } from '../dto/create-forum.dto';
import { UpdateForumDto } from '../dto/update-forum.dto';
import { ForumFiltersDto } from '../dto/forum-filters.dto';
import logger from '../../../common/utils/logger.util';
import { FORUM_FIELDS } from '../../../common/constants/select-fields';

interface Forum {
  id: string;
  name: string;
  description: string;
  icon: string;
  is_global: boolean;
  company_id?: string;
  category: string;
  topic_count: number;
  member_count: number;
  last_activity: string;
  rules: string[];
  moderators: string[];
  created_at: string;
  updated_at: string;
}

interface ForumWithMembership extends Forum {
  isJoined: boolean;
  topicCount: number;
}

@Injectable()
export class ForumService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async createForum(createForumDto: CreateForumDto) {
    logger.info('Creating forum', { name: createForumDto.name });

    try {
      // Check if forum already exists
      const { data: existingForum, error: checkError } = await this.admin
        .from('forums')
        .select('id')
        .eq('name', createForumDto.name)
        .eq('company_name', createForumDto.companyName)
        .eq('is_global', createForumDto.isGlobal)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Database error during forum check', {
          error: checkError,
        });
      }

      if (existingForum) {
        logger.warn('Forum creation failed: Name already exists', {
          name: createForumDto.name,
        });
        throw new ConflictException('Forum with this name already exists');
      }

      const { data: forum, error } = await this.admin
        .from('forums')
        .insert({
          name: createForumDto.name,
          description: createForumDto.description,
          icon: createForumDto.icon,
          is_global: createForumDto.isGlobal,
          company_name: createForumDto.companyName,
          category: createForumDto.category,
          topic_count: 0,
          member_count: 0,
          last_activity: new Date().toISOString(),
          rules: createForumDto.rules || [],
          moderators: createForumDto.moderators || [],
        })
        .select(FORUM_FIELDS)
        .single();

      if (error) {
        logger.error('Forum creation failed', {
          error: error.message,
          data: createForumDto,
        });
        throw new BadRequestException('Failed to create forum');
      }

      logger.info('Forum created successfully', { forumId: forum.id });
      return forum;
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error during forum creation', { error });
      throw new InternalServerErrorException('Forum creation failed');
    }
  }

  async findAllForums(filters: ForumFiltersDto) {
    logger.info('Fetching forums', {
      filters,
      isGlobalType: typeof filters.isGlobal,
      isGlobalValue: filters.isGlobal,
    });

    try {
      const {
        search,
        sortBy = 'recent',
        timeFilter,
        companyName,
        isGlobal,
        category,
        page = 1,
        limit = 10,
      } = filters;

      // Debug: Log the actual values being used
      logger.debug('Filter values being applied', {
        companyName,
        isGlobal,
        isGlobalType: typeof isGlobal,
        category,
        page,
        limit,
      });

      const skip = (page - 1) * limit;

      let query = this.admin.from('forums').select('*', { count: 'exact' });

      // Apply filters
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,description.ilike.%${search}%`,
        );
      }

      if (companyName !== undefined) {
        query = query.eq('company_name', companyName);
      }

      // FIX: Add explicit logging for isGlobal filter
      if (isGlobal !== undefined) {
        logger.debug('Applying isGlobal filter', {
          isGlobal,
          isGlobalType: typeof isGlobal,
        });
        query = query.eq('is_global', isGlobal);
      } else {
        logger.debug('No isGlobal filter applied');
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (timeFilter && timeFilter !== 'all') {
        const now = new Date();
        const timeMap = {
          today: new Date(now.setDate(now.getDate() - 1)),
          week: new Date(now.setDate(now.getDate() - 7)),
          month: new Date(now.setMonth(now.getMonth() - 1)),
        };
        query = query.gte('last_activity', timeMap[timeFilter].toISOString());
      }

      // Apply sorting
      switch (sortBy) {
        case 'recent':
          query = query.order('last_activity', { ascending: false });
          break;
        case 'popular':
          query = query.order('member_count', { ascending: false });
          break;
        case 'trending':
          query = query.order('topic_count', { ascending: false });
          break;
        default:
          query = query.order('last_activity', { ascending: false });
      }

      // Apply pagination
      query = query.range(skip, skip + limit - 1);

      const { data: forums, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch forums', { error: error.message });
        throw new BadRequestException('Failed to fetch forums');
      }

      const total = count || 0;

      logger.info('Forums fetched successfully', {
        count: total,
        appliedFilters: {
          companyName,
          isGlobal,
          category,
        },
      });
      return {
        forums,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching forums', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to fetch forums');
    }
  }

  async findForumById(id: string) {
    logger.info('Fetching forum by ID', { forumId: id });

    try {
      const { data: forum, error } = await this.admin
        .from('forums')
        .select(
          `
          *,
          forum_topics(
            id,
            title,
            content,
            created_at,
            views_count,
            comments_count,
            reaction_validated_count,
            user_profile:user_id(
              id,
              username,
              avatar
            )
          )
        `,
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Forum not found');
        }
        logger.error('Failed to fetch forum', {
          forumId: id,
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch forum');
      }

      if (!forum) {
        throw new NotFoundException('Forum not found');
      }

      // Use the cached counts from the forum table instead of separate queries
      const formattedForum = {
        ...forum,
        memberCount: forum.member_count || 0,
        topicCount: forum.topic_count || 0,
      };

      logger.info('Forum fetched successfully', { forumId: id });
      return formattedForum;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error fetching forum', { forumId: id, error });
      throw new InternalServerErrorException('Failed to fetch forum');
    }
  }

  async updateForum(id: string, updateForumDto: UpdateForumDto) {
    logger.info('Updating forum', { forumId: id });

    try {
      // Check if forum exists
      await this.findForumById(id);

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updateForumDto.name !== undefined)
        updateData.name = updateForumDto.name;
      if (updateForumDto.description !== undefined)
        updateData.description = updateForumDto.description;
      if (updateForumDto.icon !== undefined)
        updateData.icon = updateForumDto.icon;
      if (updateForumDto.isGlobal !== undefined)
        updateData.is_global = updateForumDto.isGlobal;
      // FIXED: Use company_name instead of company_id
      if (updateForumDto.companyName !== undefined)
        updateData.company_name = updateForumDto.companyName;
      if (updateForumDto.category !== undefined)
        updateData.category = updateForumDto.category;
      if (updateForumDto.rules !== undefined)
        updateData.rules = updateForumDto.rules;
      if (updateForumDto.moderators !== undefined)
        updateData.moderators = updateForumDto.moderators;

      const { data: forum, error } = await this.admin
        .from('forums')
        .update(updateData)
        .eq('id', id)
        .select(FORUM_FIELDS)
        .single();

      if (error) {
        logger.error('Forum update failed', {
          forumId: id,
          error: error.message,
        });
        throw new BadRequestException('Failed to update forum');
      }

      logger.info('Forum updated successfully', { forumId: id });
      return forum;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error updating forum', {
        forumId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to update forum');
    }
  }

  async deleteForum(id: string) {
    logger.info('Deleting forum', { forumId: id });

    try {
      // Check if forum exists
      await this.findForumById(id);

      const { error } = await this.admin.from('forums').delete().eq('id', id);

      if (error) {
        logger.error('Forum deletion failed', {
          forumId: id,
          error: error.message,
        });
        throw new BadRequestException('Failed to delete forum');
      }

      logger.info('Forum deleted successfully', { forumId: id });
      return { success: true, message: 'Forum deleted successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error deleting forum', { forumId: id, error });
      throw new InternalServerErrorException('Failed to delete forum');
    }
  }

  async joinForum(forumId: string, userId: string) {
    logger.info('User joining forum', { forumId, userId });

    try {
      // Check if forum exists
      const forum = await this.findForumById(forumId);

      // Check if user is already a member
      const { data: existingMember, error: checkError } = await this.admin
        .from('forum_members')
        .select('id')
        .eq('forum_id', forumId)
        .eq('user_id', userId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Database error during membership check', {
          forumId,
          userId,
          error: checkError,
        });
      }

      if (existingMember) {
        logger.warn('User already member of forum', { forumId, userId });
        throw new ConflictException('User is already a member of this forum');
      }

      // Add user to forum
      const { error } = await this.admin.from('forum_members').insert({
        id: crypto.randomUUID(), // ← CRITICAL: generate UUID here
        forum_id: forumId,
        user_id: userId,
        joined_at: new Date().toISOString(),
      });

      if (error) {
        logger.error('Failed to join forum', {
          forumId,
          userId,
          error: error.message,
        });
        throw new BadRequestException('Failed to join forum');
      }

      const { error: incError } = await this.admin.rpc(
        'increment_forum_member_count',
        { forum_id: forumId },
      );

      if (incError) {
        logger.warn('RPC increment failed, falling back to manual update', {
          forumId,
          error: incError.message,
        });
        // Fallback: manual update
        await this.admin
          .from('forums')
          .update({
            member_count: forum.member_count + 1,
            last_activity: new Date().toISOString(),
          })
          .eq('id', forumId);
      }
      logger.info('User joined forum successfully', { forumId, userId });
      return { success: true, message: 'Successfully joined forum' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error joining forum', {
        forumId,
        userId,
        error,
      });
      throw new InternalServerErrorException('Failed to join forum');
    }
  }

  async leaveForum(forumId: string, userId: string) {
    logger.info('User leaving forum', { forumId, userId });

    try {
      // Check if forum exists
      await this.findForumById(forumId);

      // Check if user is a member
      const { data: existingMember, error: checkError } = await this.admin
        .from('forum_members')
        .select('id')
        .eq('forum_id', forumId)
        .eq('user_id', userId)
        .single();

      if (checkError?.code === 'PGRST116' || !existingMember) {
        throw new ConflictException('User is not a member of this forum');
      }

      // Remove user from forum
      const { error } = await this.admin
        .from('forum_members')
        .delete()
        .eq('forum_id', forumId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Failed to leave forum', {
          forumId,
          userId,
          error: error.message,
        });
        throw new BadRequestException('Failed to leave forum');
      }

      // Optimized: Update member count using decrement
      // Decrement member count using RPC
      const { error: decError } = await this.admin.rpc(
        'decrement_forum_member_count',
        { forum_id: forumId },
      );

      if (decError) {
        logger.warn('RPC decrement failed, falling back to manual update', {
          forumId,
          error: decError.message,
        });
        // Get current count first to avoid going negative
        const { data: currentForum } = await this.admin
          .from('forums')
          .select('member_count')
          .eq('id', forumId)
          .single();

        await this.admin
          .from('forums')
          .update({
            member_count: Math.max(0, (currentForum?.member_count || 1) - 1),
          })
          .eq('id', forumId);
      }

      logger.info('User left forum successfully', { forumId, userId });
      return { success: true, message: 'Successfully left forum' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error leaving forum', {
        forumId,
        userId,
        error,
      });
      throw new InternalServerErrorException('Failed to leave forum');
    }
  }

  async getUserJoinedForums(
    userId: string,
    companyName?: string,
  ): Promise<ForumWithMembership[]> {
    logger.info('Fetching user joined forums', { userId, companyName });

    try {
      let query = this.admin
        .from('forum_members')
        .select(
          `
        forum_id,
        forums:forum_id(
          id,
          name,
          description,
          icon,
          is_global,
          company_name,
          category,
          topic_count,
          member_count,
          last_activity,
          rules,
          moderators
        )
      `,
        )
        .eq('user_id', userId);

      const { data: memberships, error } = await query;

      if (error) {
        logger.error('Failed to fetch user forum memberships', {
          userId,
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch user forums');
      }

      if (!memberships || memberships.length === 0) {
        return [];
      }

      let forums = memberships
        .map((m: any) => m.forums)
        .filter((forum: any) => forum !== null);

      if (companyName) {
        forums = forums.filter(
          (forum: any) =>
            forum.company_name === companyName || forum.is_global === true,
        );
      } else {
        forums = forums.filter((forum: any) => forum.is_global === true);
      }

      const forumsWithDetails = forums.map((forum: any) => ({
        ...forum,
        isJoined: true,
        topicCount: forum.topic_count || 0,
      }));

      logger.info('User forums fetched successfully', {
        userId,
        count: forumsWithDetails.length,
      });
      return forumsWithDetails;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching user forums', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to fetch user forums');
    }
  }

  async bootstrapFoundationForums(companyName: string) {
    logger.info('=== START: Bootstrap Foundation Forums ===', { companyName });

    const foundationForums = [
      {
        name: 'Career Growth',
        description:
          'Advancement strategies, promotion tips, and career development',
        icon: '📈',
        is_global: false,
        category: 'foundation',
        rules: [
          'Be respectful and professional in all interactions',
          'Share experiences honestly while maintaining privacy',
          'Support others and contribute constructively',
        ],
        moderators: [],
      },
      {
        name: 'Sponsorship',
        description: 'Finding sponsors and building influential relationships',
        icon: '🤝',
        is_global: false,
        category: 'foundation',
        rules: [
          'Be respectful and professional in all interactions',
          'Share experiences honestly while maintaining privacy',
          'Support others and contribute constructively',
        ],
        moderators: [],
      },
      {
        name: 'Bias & Microaggressions',
        description: 'Addressing workplace bias and microaggressions',
        icon: '⚖️',
        is_global: false,
        category: 'foundation',
        rules: [
          'Be respectful and professional in all interactions',
          'Share experiences honestly while maintaining privacy',
          'Support others and contribute constructively',
        ],
        moderators: [],
      },
      {
        name: 'Mentorship',
        description: 'Mentor connections and guidance',
        icon: '🎯',
        is_global: false,
        category: 'foundation',
        rules: [
          'Be respectful and professional in all interactions',
          'Share experiences honestly while maintaining privacy',
          'Support others and contribute constructively',
        ],
        moderators: [],
      },
      {
        name: 'Wellbeing',
        description: 'Mental health, work-life balance, and self-care',
        icon: '🌱',
        is_global: false,
        category: 'foundation',
        rules: [
          'Be respectful and professional in all interactions',
          'Share experiences honestly while maintaining privacy',
          'Support others and contribute constructively',
        ],
        moderators: [],
      },
    ];

    const createdForums: any[] = [];

    try {
      // Step 1: Prepare forum names
      const forumNames = foundationForums.map((f) => f.name);
      logger.debug('STEP 1 - Forum names to check:', {
        forumNames,
        count: forumNames.length,
        companyName,
      });

      // Step 2: Check for existing forums
      logger.debug('STEP 2 - Querying existing forums...');
      const { data: existingForumsData, error: checkError } = await this.admin
        .from('forums')
        .select('id, name, company_name')
        .eq('company_name', companyName)
        .in('name', forumNames);

      // Log the raw query response
      logger.debug('STEP 2 - Raw query response:', {
        data: existingForumsData,
        error: checkError,
        hasData: !!existingForumsData,
        dataLength: existingForumsData?.length || 0,
        errorMessage: checkError?.message,
      });

      if (checkError) {
        logger.error('ERROR checking existing forums:', {
          error: checkError.message,
          details: checkError,
          companyName,
          forumNames,
        });
        throw new Error(`Database query failed: ${checkError.message}`);
      }

      // Ensure we have an array (even if empty)
      const existingRecords = Array.isArray(existingForumsData)
        ? existingForumsData
        : [];
      logger.debug('STEP 2 - Processed existing records:', {
        count: existingRecords.length,
        records: existingRecords.map((r) => ({
          id: r.id,
          name: r.name,
          company: r.company_name,
        })),
      });

      // Step 3: Identify which forums need to be created
      const existingForumNames = new Set(
        existingRecords.map((f: any) => f.name),
      );
      logger.debug('STEP 3 - Existing forum names set:', {
        existingForumNames: Array.from(existingForumNames),
        setSize: existingForumNames.size,
      });

      const forumsToCreate = foundationForums
        .filter((f) => !existingForumNames.has(f.name))
        .map((f) => ({
          ...f,
          company_name: companyName,
          topic_count: 0,
          member_count: 0,
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

      logger.debug('STEP 3 - Forums to create:', {
        count: forumsToCreate.length,
        forums: forumsToCreate.map((f) => ({
          name: f.name,
          company: f.company_name,
          category: f.category,
        })),
      });

      // Step 4: Insert new forums
      if (forumsToCreate.length > 0) {
        logger.debug('STEP 4 - Inserting new forums...', {
          forumCount: forumsToCreate.length,
          firstForum: forumsToCreate[0],
        });

        const { data: newForums, error: insertError } = await this.admin
          .from('forums')
          .insert(forumsToCreate)
          .select('id, name, company_name, created_at');

        logger.debug('STEP 4 - Insert response:', {
          newForums,
          insertError,
          hasNewForums: !!newForums,
          newForumsCount: newForums?.length || 0,
          insertErrorMessage: insertError?.message,
          insertErrorDetails: insertError,
        });

        if (insertError) {
          logger.error('ERROR inserting forums:', {
            error: insertError.message,
            details: insertError,
            forumsAttempted: forumsToCreate.map((f) => f.name),
          });
          throw new Error(`Failed to create forums: ${insertError.message}`);
        }

        if (newForums && newForums.length > 0) {
          createdForums.push(...newForums);
          logger.info('SUCCESS - Created forums:', {
            count: newForums.length,
            names: newForums.map((f) => f.name),
          });
        } else {
          logger.warn('No forums were created despite insert attempt');
        }
      } else {
        logger.info('No new forums to create - all already exist');
      }

      // Step 5: Build comprehensive response
      const existingForums = existingRecords.map((f: any) => ({
        id: f.id,
        name: f.name,
        message: `${f.name} forum already exists`,
      }));

      // Log each existing forum for tracking
      existingForums.forEach((f) => {
        logger.debug('Existing forum:', {
          name: f.name,
          id: f.id,
          company: companyName,
        });
      });

      const response = {
        companyName,
        createdCount: createdForums.length,
        existingCount: existingForums.length,
        createdForums: createdForums.map((f) => ({
          id: f.id,
          name: f.name,
          created_at: f.created_at,
        })),
        existingForums,
        message:
          existingForums.length > 0
            ? `${createdForums.length} new forum(s) created, ${existingForums.length} already existed for ${companyName}.`
            : `All ${createdForums.length} foundation forums were created for ${companyName}.`,
        timestamp: new Date().toISOString(),
      };

      logger.info('=== COMPLETE: Foundation forums bootstrapped ===', response);

      return {
        success: true,
        data: response,
        timestamp: response.timestamp,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('=== FAILED: Bootstrap foundation forums ===', {
        companyName,
        error: errorMessage,
        stack: errorStack,
        timestamp: new Date().toISOString(),
      });

      // Return error response instead of throwing
      return {
        success: false,
        error: errorMessage,
        message: `Failed to bootstrap forums for ${companyName}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
  async getLocalForumMetrics(companyName: string) {
    logger.info('Fetching local forum metrics', { companyName });

    try {
      // Get all local forums for the company
      const { data: forums, error } = await this.admin
        .from('forums')
        .select(
          `
        id,
        name,
        description,
        icon,
        topic_count,
        member_count,
        last_activity,
        is_global,
        company_name,
        category
      `,
        )
        .eq('company_name', companyName)
        .eq('is_global', false);

      if (error) {
        logger.error('Failed to fetch local forum metrics', {
          companyName,
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch local forum metrics');
      }

      logger.debug('Final forums query results', {
        companyName,
        forumsFound: forums?.length,
      });

      // OPTIMIZED: Use cached counts from forum table
      const totalForums = forums?.length || 0;
      const totalTopics =
        forums?.reduce((sum, forum) => sum + (forum.topic_count || 0), 0) || 0;
      const totalMembers =
        forums?.reduce((sum, forum) => sum + (forum.member_count || 0), 0) || 0;

      // Get most active forum
      let mostActiveForum = null;
      if (forums && forums.length > 0) {
        mostActiveForum = forums.reduce((mostActive, forum) => {
          if (!mostActive || !mostActive.last_activity) {
            return forum;
          }
          if (!forum.last_activity) {
            return mostActive;
          }
          return new Date(forum.last_activity) >
            new Date(mostActive.last_activity)
            ? forum
            : mostActive;
        }, forums[0]);
      }

      const metrics = {
        companyName,
        totalForums,
        totalTopics,
        totalMembers,
        mostActiveForum: mostActiveForum
          ? {
              id: mostActiveForum.id,
              name: mostActiveForum.name,
              description: mostActiveForum.description,
              icon: mostActiveForum.icon,
              lastActivity: mostActiveForum.last_activity,
              topicCount: mostActiveForum.topic_count,
              memberCount: mostActiveForum.member_count,
            }
          : null,
        forums: forums || [],
      };

      logger.info('Local forum metrics fetched successfully', {
        companyName,
        totalForums,
        totalTopics,
        totalMembers,
      });
      return metrics;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching local forum metrics', {
        companyName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException(
        'Failed to fetch local forum metrics',
      );
    }
  }

  async getGlobalForumMetrics() {
    logger.info('Fetching global forum metrics');

    try {
      // OPTIMIZED: Use cached counts, single query
      const { data: forums, error } = await this.admin
        .from('forums')
        .select(
          `
        id,
        name,
        description,
        icon,
        topic_count,
        member_count,
        last_activity,
        category
      `,
        )
        .eq('is_global', true)
        .order('topic_count', { ascending: false })
        .order('member_count', { ascending: false });

      if (error) {
        logger.error('Failed to fetch global forum metrics', {
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch global forum metrics');
      }

      // Calculate engagement score for each forum (combination of topics and members)
      const forumsWithMetrics = (forums || []).map((forum) => ({
        ...forum,
        engagementScore:
          (forum.topic_count || 0) * 2 + (forum.member_count || 0),
      }));

      // Sort by engagement score (highest first)
      forumsWithMetrics.sort((a, b) => b.engagementScore - a.engagementScore);

      logger.info('Global forum metrics fetched successfully', {
        count: forumsWithMetrics.length,
      });
      return {
        totalGlobalForums: forumsWithMetrics.length,
        totalGlobalTopics: forumsWithMetrics.reduce(
          (sum, forum) => sum + (forum.topic_count || 0),
          0,
        ),
        totalGlobalMembers: forumsWithMetrics.reduce(
          (sum, forum) => sum + (forum.member_count || 0),
          0,
        ),
        forums: forumsWithMetrics,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching global forum metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException(
        'Failed to fetch global forum metrics',
      );
    }
  }

  async getFoundationForumsWithMetrics(companyName: string) {
    logger.info('Fetching foundation forums with metrics', { companyName });

    try {
      // Get all foundation forums for the company
      const { data: forums, error } = await this.admin
        .from('forums')
        .select(
          `
        id,
        name,
        description,
        icon,
        topic_count,
        member_count,
        last_activity,
        category,
        rules,
        moderators
        `,
        )
        .eq('company_name', companyName)
        .eq('category', 'foundation')
        .order('name', { ascending: true });

      if (error) {
        logger.error('Failed to fetch foundation forums', {
          companyName,
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch foundation forums');
      }

      if (!forums || forums.length === 0) {
        logger.info('No foundation forums found for company', { companyName });
        return {
          companyName,
          totalFoundationForums: 0,
          totalTopics: 0,
          totalMembers: 0,
          forums: [],
        };
      }

      const forumIds = forums.map((f) => f.id);

      // OPTIMIZED: Batch fetch recent topics for all forums at once
      const { data: recentTopics } = await this.admin
        .from('forum_topics')
        .select(
          `
          id,
          title,
          created_at,
          forum_id,
          user_id,
          user_profiles!forum_topics_user_id_fkey(username, avatar)
        `,
        )
        .in('forum_id', forumIds)
        .order('created_at', { ascending: false });

      // Group recent topics by forum_id
      const recentTopicsByForum = new Map();
      (recentTopics || []).forEach((topic: any) => {
        if (!recentTopicsByForum.has(topic.forum_id)) {
          recentTopicsByForum.set(topic.forum_id, topic);
        }
      });

      // OPTIMIZED: Batch fetch unique topic creators for all forums
      const { data: topicCreators } = await this.admin
        .from('forum_topics')
        .select('forum_id, user_id')
        .in('forum_id', forumIds);

      // Group creators by forum_id
      const creatorsByForum = new Map();
      (topicCreators || []).forEach((tc: any) => {
        if (!creatorsByForum.has(tc.forum_id)) {
          creatorsByForum.set(tc.forum_id, new Set());
        }
        creatorsByForum.get(tc.forum_id).add(tc.user_id);
      });

      // Build detailed metrics using cached data
      const forumsWithDetailedMetrics = forums.map((forum) => {
        const actualTopicCount = forum.topic_count || 0;
        const actualMemberCount = forum.member_count || 0;

        // Get recent activity
        const recentTopic = recentTopicsByForum.get(forum.id);
        let recentActivity = null;
        if (recentTopic) {
          recentActivity = {
            topicId: recentTopic.id,
            topicTitle: recentTopic.title,
            createdAt: recentTopic.created_at,
            author: recentTopic.user_profiles
              ? {
                  username: recentTopic.user_profiles.username,
                  avatar: recentTopic.user_profiles.avatar,
                }
              : null,
          };
        }

        // Calculate engagement rate
        let engagementRate = 0;
        if (actualMemberCount > 0 && actualTopicCount > 0) {
          const uniqueCreators = creatorsByForum.get(forum.id)?.size || 0;
          engagementRate = Math.round(
            (uniqueCreators / actualMemberCount) * 100,
          );
        }

        return {
          id: forum.id,
          name: forum.name,
          description: forum.description,
          icon: forum.icon,
          category: forum.category,
          rules: forum.rules || [],
          moderators: forum.moderators || [],
          originalTopicCount: forum.topic_count || 0,
          originalMemberCount: forum.member_count || 0,
          lastActivity: forum.last_activity,
          metrics: {
            topicCount: actualTopicCount,
            memberCount: actualMemberCount,
            engagementRate,
            recentActivity,
            activityLevel: this.calculateActivityLevel(forum.last_activity),
            growthTrend: 'stable' as const, // Simplified to avoid extra queries
          },
        };
      });

      // Calculate overall metrics
      const totalTopics = forumsWithDetailedMetrics.reduce(
        (sum, forum) => sum + forum.metrics.topicCount,
        0,
      );
      const totalMembers = forumsWithDetailedMetrics.reduce(
        (sum, forum) => sum + forum.metrics.memberCount,
        0,
      );

      // Sort forums by activity level (most active first)
      const sortedForums = forumsWithDetailedMetrics.sort((a, b) => {
        const aScore = a.metrics.topicCount * 2 + a.metrics.memberCount;
        const bScore = b.metrics.topicCount * 2 + b.metrics.memberCount;
        return bScore - aScore;
      });

      const result = {
        companyName,
        totalFoundationForums: sortedForums.length,
        totalTopics,
        totalMembers,
        overallEngagementRate:
          totalMembers > 0
            ? Math.round(
                sortedForums.reduce(
                  (sum, forum) => sum + forum.metrics.engagementRate,
                  0,
                ) / sortedForums.length,
              )
            : 0,
        forums: sortedForums,
      };

      logger.info('Foundation forums with metrics fetched successfully', {
        companyName,
        forumCount: result.totalFoundationForums,
        totalTopics: result.totalTopics,
        totalMembers: result.totalMembers,
      });

      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching foundation forums with metrics', {
        companyName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException(
        'Failed to fetch foundation forums with metrics',
      );
    }
  }

  // Helper method to calculate activity level
  private calculateActivityLevel(lastActivity: string | null): string {
    if (!lastActivity) return 'low';

    try {
      const lastActivityDate = new Date(lastActivity);
      const now = new Date();
      const daysSinceActivity = Math.floor(
        (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceActivity <= 1) return 'high';
      if (daysSinceActivity <= 7) return 'medium';
      return 'low';
    } catch (error) {
      return 'low';
    }
  }
}
