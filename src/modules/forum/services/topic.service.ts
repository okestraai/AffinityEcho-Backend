import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { CreateTopicDto } from '../dto/create-topic.dto';
import { ForumFiltersDto } from '../dto/forum-filters.dto';
import logger from '../../../common/utils/logger.util';

interface UserReaction {
  seen: boolean;
  validated: boolean;
  inspired: boolean;
  heard: boolean;
}

interface UserReactionsMap {
  [topicId: string]: UserReaction;
}

interface DatabaseTopicReaction {
  topic_id: string;
  reaction_type: string;
}

@Injectable()
export class TopicService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async createTopic(createTopicDto: CreateTopicDto, userId: string) {
    logger.info('Creating topic', {
      forumId: createTopicDto.forumId,
      userId,
    });

    try {
      const { forumId, companyName } = createTopicDto;

      // Check if forum exists
      const { data: forum, error: forumError } = await this.admin
        .from('forums')
        .select('id, is_global, topic_count')
        .eq('id', forumId)
        .single();

      if (forumError || !forum) {
        throw new NotFoundException('Forum not found');
      }

      // Check if user is member of the forum (for non-global forums)
      if (!forum.is_global) {
        const { data: membership, error: membershipError } = await this.admin
          .from('forum_members')
          .select('id')
          .eq('forum_id', forumId)
          .eq('user_id', userId)
          .single();

        if (membershipError?.code === 'PGRST116' || !membership) {
          throw new ForbiddenException(
            'You must join the forum before creating topics',
          );
        }
      }

      const { data: topic, error } = await this.admin
        .from('forum_topics')
        .insert({
          title: createTopicDto.title,
          content: createTopicDto.content,
          forum_id: createTopicDto.forumId,
          company_name: createTopicDto.companyName, // FIXED: changed from company_id to company_name
          scope: createTopicDto.scope,
          user_id: userId,
          is_anonymous: createTopicDto.isAnonymous || true,
          tags: createTopicDto.tags || [],
          affinity_groups: createTopicDto.affinityGroups || [],
          link: createTopicDto.link || null, // ADDED: optional link field
          reaction_seen_count: 0,
          reaction_validated_count: 0,
          reaction_inspired_count: 0,
          reaction_heard_count: 0,
          views_count: 0,
          comments_count: 0,
          last_activity_at: new Date().toISOString(),
        })
        .select(
          `
        *,
        user_profile:user_id(
          id,
          username,
          avatar
        ),
        forum:forum_id(
          id,
          name,
          icon
        )
      `,
        )
        .single();

      if (error) {
        logger.error('Topic creation failed', {
          error: error.message,
          data: createTopicDto,
        });
        throw new BadRequestException('Failed to create topic');
      }

      // Update forum activity and topic count
      await this.admin
        .from('forums')
        .update({
          topic_count: forum.topic_count + 1,
          last_activity: new Date().toISOString(),
        })
        .eq('id', forumId);

      logger.info('Topic created successfully', { topicId: topic.id });
      return topic;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error creating topic', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to create topic');
    }
  }

  async findAllTopics(filters: ForumFiltersDto, userId?: string) {
    logger.info('Fetching topics', { filters, userId });

    try {
      const {
        search,
        sortBy = 'recent',
        timeFilter,
        companyName,
        forumId,
        page = 1,
        limit = 10,
      } = filters;

      const skip = (page - 1) * limit;

      let query = this.admin.from('forum_topics').select(
        `
        *,
        user_profile:user_id(
          id,
          username,
          avatar
        ),
        forum:forum_id(
          id,
          name,
          icon
        ),
        forum_comments(count)
      `,
        { count: 'exact' },
      );

      // Apply filters
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      // FIXED: Use company_name instead of company_id
      if (companyName) {
        query = query.eq('company_name', companyName);
      }

      if (forumId) {
        query = query.eq('forum_id', forumId);
      }

      if (timeFilter && timeFilter !== 'all') {
        const now = new Date();
        const timeMap = {
          today: new Date(now.setDate(now.getDate() - 1)),
          week: new Date(now.setDate(now.getDate() - 7)),
          month: new Date(now.setMonth(now.getMonth() - 1)),
        };
        query = query.gte('created_at', timeMap[timeFilter].toISOString());
      }

      // Apply sorting
      switch (sortBy) {
        case 'recent':
          query = query.order('last_activity_at', { ascending: false });
          break;
        case 'popular':
          query = query.order('views_count', { ascending: false });
          break;
        case 'trending':
          query = query.order('last_activity_at', { ascending: false });
          break;
        default:
          query = query.order('last_activity_at', { ascending: false });
      }

      // Apply pagination
      query = query.range(skip, skip + limit - 1);

      const { data: topics, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch topics', { error: error.message });
        throw new BadRequestException('Failed to fetch topics');
      }

      // Get user reactions if userId provided
      let userReactions: UserReactionsMap = {};
      if (userId && topics && topics.length > 0) {
        const { data: reactions } = await this.admin
          .from('topic_reactions')
          .select('topic_id, reaction_type')
          .eq('user_id', userId)
          .in(
            'topic_id',
            topics.map((t) => t.id),
          );

        userReactions = (reactions || []).reduce(
          (acc: UserReactionsMap, reaction: DatabaseTopicReaction) => {
            const topicId = reaction.topic_id;
            const reactionType = reaction.reaction_type;

            if (!acc[topicId]) {
              acc[topicId] = {
                seen: false,
                validated: false,
                inspired: false,
                heard: false,
              };
            }

            if (reactionType === 'seen') acc[topicId].seen = true;
            if (reactionType === 'validated') acc[topicId].validated = true;
            if (reactionType === 'inspired') acc[topicId].inspired = true;
            if (reactionType === 'heard') acc[topicId].heard = true;

            return acc;
          },
          {},
        );
      }

      const formattedTopics = (topics || []).map((topic) => {
        const reactions = userReactions[topic.id] || {
          seen: false,
          validated: false,
          inspired: false,
          heard: false,
        };

        return {
          ...topic,
          commentCount: topic.forum_comments?.[0]?.count || 0,
          reactions: {
            seen: topic.reaction_seen_count,
            validated: topic.reaction_validated_count,
            inspired: topic.reaction_inspired_count,
            heard: topic.reaction_heard_count,
          },
          userReactions: reactions,
        };
      });

      const total = count || 0;

      logger.info('Topics fetched successfully', { count: total });
      return {
        topics: formattedTopics,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching topics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to fetch topics');
    }
  }

  async findTopicById(id: string, userId?: string) {
    logger.info('Fetching topic by ID', { topicId: id, userId });

    try {
      const { data: topic, error } = await this.admin
        .from('forum_topics')
        .select(
          `
          *,
          user_profile:user_id(
            id,
            username,
            avatar
          ),
          forum:forum_id(
            id,
            name,
            description,
            icon
          ),
          forum_comments(
            id,
            content,
            created_at,
            user_profile:user_id(
              id,
              username,
              avatar
            ),
            helpful_count,
            supportive_count,
            parent_comment_id
          )
        `,
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Topic not found');
        }
        logger.error('Failed to fetch topic', {
          topicId: id,
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch topic');
      }

      if (!topic) {
        throw new NotFoundException('Topic not found');
      }

      // Get user reactions if userId provided
      let userReactions: UserReaction = {
        seen: false,
        validated: false,
        inspired: false,
        heard: false,
      };

      if (userId) {
        const { data: reactions } = await this.admin
          .from('topic_reactions')
          .select('reaction_type')
          .eq('topic_id', id)
          .eq('user_id', userId);

        userReactions = (reactions || []).reduce(
          (acc: UserReaction, reaction: any) => {
            if (reaction.reaction_type === 'seen') acc.seen = true;
            if (reaction.reaction_type === 'validated') acc.validated = true;
            if (reaction.reaction_type === 'inspired') acc.inspired = true;
            if (reaction.reaction_type === 'heard') acc.heard = true;
            return acc;
          },
          { ...userReactions },
        );
      }

      // Increment view count by fetching current value first
      const { data: currentTopic } = await this.admin
        .from('forum_topics')
        .select('views_count')
        .eq('id', id)
        .single();

      if (currentTopic) {
        await this.admin
          .from('forum_topics')
          .update({
            views_count: currentTopic.views_count + 1,
          })
          .eq('id', id);
      }

      const formattedTopic = {
        ...topic,
        reactions: {
          seen: topic.reaction_seen_count,
          validated: topic.reaction_validated_count,
          inspired: topic.reaction_inspired_count,
          heard: topic.reaction_heard_count,
        },
        userReactions,
        commentCount: topic.forum_comments?.length || 0,
      };

      logger.info('Topic fetched successfully', { topicId: id });
      return formattedTopic;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error fetching topic', { topicId: id, error });
      throw new InternalServerErrorException('Failed to fetch topic');
    }
  }

  async addReaction(topicId: string, userId: string, reactionType: string) {
    logger.info('Adding topic reaction', { topicId, userId, reactionType });

    try {
      // Check if topic exists and get current reaction counts
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('*')
        .eq('id', topicId)
        .single();

      if (topicError || !topic) {
        throw new NotFoundException('Topic not found');
      }

      // Check if reaction already exists
      const { data: existingReaction, error: checkError } = await this.admin
        .from('topic_reactions')
        .select('id')
        .eq('topic_id', topicId)
        .eq('user_id', userId)
        .eq('reaction_type', reactionType)
        .single();

      if (existingReaction) {
        // Remove reaction
        const { error: deleteError } = await this.admin
          .from('topic_reactions')
          .delete()
          .eq('topic_id', topicId)
          .eq('user_id', userId)
          .eq('reaction_type', reactionType);

        if (deleteError) {
          throw new BadRequestException('Failed to remove reaction');
        }

        // Decrement reaction count
        const reactionField = `reaction_${reactionType}_count`;
        const currentCount = topic[reactionField] || 0;

        await this.admin
          .from('forum_topics')
          .update({
            [reactionField]: Math.max(0, currentCount - 1),
          })
          .eq('id', topicId);

        logger.info('Topic reaction removed', {
          topicId,
          userId,
          reactionType,
        });
        return { action: 'removed', reactionType };
      } else {
        // Add reaction
        const { error: insertError } = await this.admin
          .from('topic_reactions')
          .insert({
            topic_id: topicId,
            user_id: userId,
            reaction_type: reactionType,
          });

        if (insertError) {
          throw new BadRequestException('Failed to add reaction');
        }

        // Increment reaction count
        const reactionField = `reaction_${reactionType}_count`;
        const currentCount = topic[reactionField] || 0;

        await this.admin
          .from('forum_topics')
          .update({
            [reactionField]: currentCount + 1,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', topicId);

        logger.info('Topic reaction added', { topicId, userId, reactionType });
        return { action: 'added', reactionType };
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error adding reaction', {
        topicId,
        userId,
        reactionType,
        error,
      });
      throw new InternalServerErrorException('Failed to add reaction');
    }
  }

  async deleteTopic(id: string, userId: string) {
    logger.info('Deleting topic', { topicId: id, userId });

    try {
      // Check if topic exists and user owns it
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('id, user_id, forum_id')
        .eq('id', id)
        .single();

      if (topicError || !topic) {
        throw new NotFoundException('Topic not found');
      }

      if (topic.user_id !== userId) {
        throw new ForbiddenException('You can only delete your own topics');
      }

      const { error } = await this.admin
        .from('forum_topics')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Topic deletion failed', {
          topicId: id,
          error: error.message,
        });
        throw new BadRequestException('Failed to delete topic');
      }

      // Update forum topic count by fetching current value first
      const { data: forum } = await this.admin
        .from('forums')
        .select('topic_count')
        .eq('id', topic.forum_id)
        .single();

      if (forum) {
        await this.admin
          .from('forums')
          .update({
            topic_count: Math.max(0, forum.topic_count - 1),
          })
          .eq('id', topic.forum_id);
      }

      logger.info('Topic deleted successfully', { topicId: id });
      return { success: true, message: 'Topic deleted successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error('Unexpected error deleting topic', { topicId: id, error });
      throw new InternalServerErrorException('Failed to delete topic');
    }
  }

  async findRecentDiscussions(
    filters: ForumFiltersDto,
    userId: string,
    userCompanyName?: string,
  ) {
    logger.info('Fetching recent discussions', {
      filters,
      userId,
      userCompanyName,
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

      const skip = (page - 1) * limit;

      let query = this.admin.from('forum_topics').select(
        `
      *,
      user_profile:user_id(
        id,
        username,
        avatar
      ),
      forum:forum_id(
        id,
        name,
        icon,
        is_global,
        company_name
      ),
      forum_comments(count)
    `,
        { count: 'exact' },
      );

      // Apply filters for recent discussions
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      // FIXED: Handle undefined userCompanyName and use provided companyName as fallback
      const targetCompanyName = userCompanyName || companyName;

      if (targetCompanyName) {
        // Use OR filter for global topics OR local topics matching the company
        query = query.or(
          `forum.is_global.eq.true,forum.company_name.eq.${targetCompanyName}`,
        );
      } else {
        // If no company name is available, only show global topics
        query = query.eq('forum.is_global', true);
      }

      if (category) {
        query = query.eq('forum.category', category);
      }

      if (timeFilter && timeFilter !== 'all') {
        const now = new Date();
        const timeMap = {
          today: new Date(now.setDate(now.getDate() - 1)),
          week: new Date(now.setDate(now.getDate() - 7)),
          month: new Date(now.setMonth(now.getMonth() - 1)),
        };
        query = query.gte('created_at', timeMap[timeFilter].toISOString());
      }

      // Always sort by most recent first for discussions
      query = query.order('last_activity_at', { ascending: false });

      // Apply pagination
      query = query.range(skip, skip + limit - 1);

      const { data: topics, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch recent discussions', {
          error: error.message,
        });
        throw new BadRequestException('Failed to fetch recent discussions');
      }

      // Get user reactions if userId provided
      let userReactions: UserReactionsMap = {};
      if (userId && topics && topics.length > 0) {
        const { data: reactions } = await this.admin
          .from('topic_reactions')
          .select('topic_id, reaction_type')
          .eq('user_id', userId)
          .in(
            'topic_id',
            topics.map((t) => t.id),
          );

        userReactions = (reactions || []).reduce(
          (acc: UserReactionsMap, reaction: DatabaseTopicReaction) => {
            const topicId = reaction.topic_id;
            const reactionType = reaction.reaction_type;

            if (!acc[topicId]) {
              acc[topicId] = {
                seen: false,
                validated: false,
                inspired: false,
                heard: false,
              };
            }

            if (reactionType === 'seen') acc[topicId].seen = true;
            if (reactionType === 'validated') acc[topicId].validated = true;
            if (reactionType === 'inspired') acc[topicId].inspired = true;
            if (reactionType === 'heard') acc[topicId].heard = true;

            return acc;
          },
          {},
        );
      }

      const formattedTopics = (topics || []).map((topic) => {
        const reactions = userReactions[topic.id] || {
          seen: false,
          validated: false,
          inspired: false,
          heard: false,
        };

        return {
          ...topic,
          commentCount: topic.forum_comments?.[0]?.count || 0,
          reactions: {
            seen: topic.reaction_seen_count,
            validated: topic.reaction_validated_count,
            inspired: topic.reaction_inspired_count,
            heard: topic.reaction_heard_count,
          },
          userReactions: reactions,
        };
      });

      const total = count || 0;

      logger.info('Recent discussions fetched successfully', {
        count: total,
        targetCompanyName,
        appliedFilters: filters,
      });
      return {
        topics: formattedTopics,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      logger.error('Unexpected error fetching recent discussions', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException(
        'Failed to fetch recent discussions',
      );
    }
  }
}
