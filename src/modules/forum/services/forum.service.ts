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
        .select()
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

      // Get member count separately
      const { data: members, error: membersError } = await this.admin
        .from('forum_members')
        .select('id', { count: 'exact', head: true })
        .eq('forum_id', id);

      const memberCount = membersError ? 0 : members?.length || 0;

      // Format the response
      const formattedForum = {
        ...forum,
        memberCount,
        topicCount: forum.forum_topics?.length || 0,
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
        .select()
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

      // Update member count by fetching current count and incrementing
      const { data: currentForum, error: fetchError } = await this.admin
        .from('forums')
        .select('member_count')
        .eq('id', forumId)
        .single();

      if (!fetchError && currentForum) {
        await this.admin
          .from('forums')
          .update({
            member_count: currentForum.member_count + 1,
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

      // Update member count by fetching current count and decrementing
      const { data: currentForum, error: fetchError } = await this.admin
        .from('forums')
        .select('member_count')
        .eq('id', forumId)
        .single();

      if (!fetchError && currentForum) {
        await this.admin
          .from('forums')
          .update({
            member_count: Math.max(0, currentForum.member_count - 1),
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
      // Get forum IDs that the user has joined
      const { data: memberships, error } = await this.admin
        .from('forum_members')
        .select('forum_id')
        .eq('user_id', userId);

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

      const forumIds = memberships.map((m) => m.forum_id);

      // Build query to get forums
      let query = this.admin.from('forums').select('*').in('id', forumIds);

      // Apply company filter if provided - FIXED: use company_name instead of company_id
      if (companyName) {
        query = query.or(`company_name.eq.${companyName},is_global.eq.true`);
      } else {
        query = query.eq('is_global', true);
      }

      const { data: forums, error: forumsError } = await query;

      if (forumsError) {
        logger.error('Failed to fetch forums for user', {
          userId,
          error: forumsError.message,
        });
        throw new BadRequestException('Failed to fetch forums');
      }

      // Add isJoined flag and get topic counts
      const forumsWithDetails = await Promise.all(
        (forums || []).map(async (forum: Forum) => {
          const { data: topics, error: topicsError } = await this.admin
            .from('forum_topics')
            .select('id', { count: 'exact', head: true })
            .eq('forum_id', forum.id);

          const topicCount = topicsError ? 0 : topics?.length || 0;

          return {
            ...forum,
            isJoined: true,
            topicCount,
          };
        }),
      );

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
    logger.info('Bootstrapping foundation forums', { companyName });

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

    try {
      const createdForums = [];

      for (const forumData of foundationForums) {
        // Check if forum already exists for this company
        const { data: existingForum, error: checkError } = await this.admin
          .from('forums')
          .select('id')
          .eq('name', forumData.name)
          .eq('company_name', companyName)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 is "not found" error
          logger.warn('Error checking existing forum', {
            name: forumData.name,
            error: checkError.message,
          });
          continue;
        }

        // If forum doesn't exist, create it
        if (!existingForum) {
          const { data: forum, error: createError } = await this.admin
            .from('forums')
            .insert({
              ...forumData,
              company_name: companyName,
              topic_count: 0,
              member_count: 0,
              last_activity: new Date().toISOString(),
            })
            .select()
            .single();

          if (createError) {
            logger.warn('Failed to create foundation forum', {
              name: forumData.name,
              error: createError.message,
            });
            continue;
          }

          createdForums.push(forum);
          logger.info('Created foundation forum', {
            name: forumData.name,
            id: forum.id,
          });
        } else {
          logger.info('Foundation forum already exists', {
            name: forumData.name,
            id: existingForum.id,
          });
        }
      }

      logger.info('Foundation forums bootstrapped', {
        companyName,
        created: createdForums.length,
      });
      return createdForums;
    } catch (error) {
      // Properly handle the unknown error type
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error('Unexpected error bootstrapping foundation forums', {
        companyName,
        error: errorMessage,
      });
      throw new InternalServerErrorException(
        'Failed to bootstrap foundation forums',
      );
    }
  }

  async getLocalForumMetrics(companyName: string) {
    logger.info('Fetching local forum metrics', { companyName });

    try {
      // Debug: Let's see what the actual query returns
      const { data: debugForums, error: debugError } = await this.admin
        .from('forums')
        .select('id, name, company_name, is_global')
        .eq('company_name', companyName)
        .eq('is_global', false);

      if (debugError) {
        logger.error('Debug query failed', {
          companyName,
          error: debugError.message,
        });
      } else {
        logger.debug('Debug query results', {
          companyName,
          forumsFound: debugForums?.length,
          forums: debugForums,
        });
      }

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
        forums: forums?.map((f) => ({
          id: f.id,
          name: f.name,
          topic_count: f.topic_count,
          member_count: f.member_count,
        })),
      });

      // Calculate totals from forum data
      const totalForums = forums?.length || 0;
      const totalTopics =
        forums?.reduce((sum, forum) => sum + (forum.topic_count || 0), 0) || 0;
      const totalMembers =
        forums?.reduce((sum, forum) => sum + (forum.member_count || 0), 0) || 0;

      // Get actual counts from database for accuracy
      let actualTotalTopics = 0;
      let actualTotalMembers = 0;

      if (forums && forums.length > 0) {
        const forumIds = forums.map((f) => f.id);

        // Get actual topic counts
        const { data: topicsData, error: topicsError } = await this.admin
          .from('forum_topics')
          .select('id', { count: 'exact', head: true })
          .in('forum_id', forumIds);

        if (!topicsError) {
          actualTotalTopics = topicsData?.length || 0;
        }

        // Get actual member counts
        const { data: membersData, error: membersError } = await this.admin
          .from('forum_members')
          .select('id', { count: 'exact', head: true })
          .in('forum_id', forumIds);

        if (!membersError) {
          actualTotalMembers = membersData?.length || 0;
        }
      }

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
        }, forums[0]); // Start with first forum as initial value
      }

      const metrics = {
        companyName,
        totalForums,
        totalTopics: actualTotalTopics || totalTopics,
        totalMembers: actualTotalMembers || totalMembers,
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
        totalTopics: metrics.totalTopics,
        totalMembers: metrics.totalMembers,
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
      // Get all global forums
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
          (forum.topic_count || 0) * 2 + (forum.member_count || 0), // Weight topics more
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
}
