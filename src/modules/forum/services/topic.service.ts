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
import { NotificationsService } from '../../notifications/notifications.service';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { RedisService } from '../../../common/services/redis.service';
import { OkestraService } from '../../okestra/services/okestra.service';

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

interface TopicReactionCounts {
  reaction_seen_count: number;
  reaction_validated_count: number;
  reaction_inspired_count: number;
  reaction_heard_count: number;
}

@Injectable()
export class TopicService {
  private admin;

  constructor(
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private encryption: EncryptionUtil,
    private identityReveal: IdentityRevealUtil,
    private redis: RedisService,
    private okestraService: OkestraService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // Fixed: fallback MUST return Promise<void> by executing the query
  private async safeRpc(
    rpcName: string,
    params: any,
    fallback: () => Promise<void>,
  ): Promise<void> {
    const { error } = await this.admin.rpc(rpcName, params);
    if (error) {
      logger.warn(`RPC ${rpcName} failed, using fallback`, {
        error: error.message,
      });
      await fallback();
    }
  }

  async createTopic(createTopicDto: CreateTopicDto, userId: string) {
    logger.info('Creating topic', { forumId: createTopicDto.forumId, userId });

    try {
      const { forumId } = createTopicDto;

      const { data: forum, error: forumError } = await this.admin
        .from('forums')
        .select('id, is_global, topic_count')
        .eq('id', forumId)
        .single();

      if (forumError || !forum) throw new NotFoundException('Forum not found');

      if (!forum.is_global) {
        const { data: membership } = await this.admin
          .from('forum_members')
          .select('id')
          .eq('forum_id', forumId)
          .eq('user_id', userId)
          .single();

        if (!membership) {
          throw new ForbiddenException(
            'You must join the forum before creating topics',
          );
        }
      }

      // Current timestamp for updated_at
      const currentTimestamp = new Date().toISOString();

      const { data: topic, error } = await this.admin
        .from('forum_topics')
        .insert({
          title: createTopicDto.title,
          content: createTopicDto.content,
          forum_id: forumId,
          company_name: createTopicDto.companyName,
          scope: createTopicDto.scope,
          user_id: userId,
          is_anonymous: createTopicDto.isAnonymous ?? true,
          tags: createTopicDto.tags || [],
          affinity_groups: createTopicDto.affinityGroups || [],
          link: createTopicDto.link || null,
          reaction_seen_count: 0,
          reaction_validated_count: 0,
          reaction_inspired_count: 0,
          reaction_heard_count: 0,
          views_count: 0,
          comments_count: 0,
          updated_at: currentTimestamp,
          created_at: currentTimestamp,
          last_activity_at: currentTimestamp,
        })
        .select(
          `
          *,
          user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted),
          forum:forum_id(id, name, icon)
        `,
        )
        .single();

      if (error || !topic) {
        logger.error('Topic creation failed', { error: error?.message });
        throw new BadRequestException('Failed to create topic');
      }

      // Update forum stats
      await this.safeRpc(
        'increment_forum_topic_count',
        { forum_id: forumId },
        async () => {
          await this.admin
            .from('forums')
            .update({
              topic_count: forum.topic_count + 1,
              last_activity: currentTimestamp,
            })
            .eq('id', forumId);
        },
      );

      await this.redis.delPattern('topics:*');

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
      logger.error('Unexpected error creating topic', { error });
      throw new InternalServerErrorException('Failed to create topic');
    }
  }

  async findAllTopics(filters: ForumFiltersDto, userId?: string) {
    const cacheKey = `topics:list:${JSON.stringify(filters)}:${userId || 'anon'}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    let query = this.admin.from('forum_topics').select(
      `
      *,
      user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted),
      forum:forum_id(id, name, icon, is_global),
      topic_reactions!topic_id(count)
    `,
      { count: 'exact' },
    );

    if (userId) {
      query = query.neq('user_id', userId);
    }

    // Apply filters
    if (filters.forumId) {
      query = query.eq('forum_id', filters.forumId);
    }

    if (filters.search) {
      query = query.or(`
      title.ilike.%${filters.search}%,
      content.ilike.%${filters.search}%
    `);
    }

    if (filters.companyName) {
      query = query.ilike('company_name', `%${filters.companyName}%`);
    }

    // Sorting logic
    switch (filters.sortBy) {
      case 'recent':
        query = query.order('created_at', { ascending: false });
        break;
      case 'popular':
        query = query.order('views_count', { ascending: false });
        break;
      case 'trending':
        query = query
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('comments_count', { ascending: false });
        break;
      case 'relevant':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Pagination
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const from = (page - 1) * limit;

    query = query.range(from, from + limit - 1);

    const { data: topics, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch topics', { error });
      throw new InternalServerErrorException('Failed to fetch topics');
    }

    const topicsWithReactions = (topics || []).map((topic: any) => {
      const totalReactions =
        (topic.reaction_seen_count || 0) +
        (topic.reaction_validated_count || 0) +
        (topic.reaction_inspired_count || 0) +
        (topic.reaction_heard_count || 0);

      return {
        ...topic,
        totalReactions,
        userReactions: {
          seen: false,
          validated: false,
          inspired: false,
          heard: false,
        },
      };
    });

    // Fetch user reactions if logged in
    if (userId && topicsWithReactions.length > 0) {
      const topicIds = topicsWithReactions.map((t) => t.id);

      const { data: userReactions } = await this.admin
        .from('topic_reactions')
        .select('topic_id, reaction_type')
        .eq('user_id', userId)
        .in('topic_id', topicIds);

      const reactionMap = (userReactions || []).reduce((acc: any, r: any) => {
        if (!acc[r.topic_id]) acc[r.topic_id] = {};
        acc[r.topic_id][r.reaction_type] = true;
        return acc;
      }, {});

      topicsWithReactions.forEach((topic: any) => {
        topic.userReactions = reactionMap[topic.id] || topic.userReactions;
      });
    }

    // Apply identity reveal — show real name for revealed users
    if (userId) {
      await this.applyIdentityReveals(userId, topicsWithReactions);
    }

    const result = {
      data: topicsWithReactions,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 1,
      },
    };

    await this.redis.set(cacheKey, result, 180000);

    return result;
  }

  async findTopicById(id: string, userId?: string) {
    try {
      // First, get the current topic to check its views_count
      const { data: currentTopic, error: fetchError } = await this.admin
        .from('forum_topics')
        .select('views_count')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw fetchError.code === 'PGRST116'
          ? new NotFoundException('Topic not found')
          : new BadRequestException('Failed to fetch topic');
      }

      // Increment view count - FIXED: Use proper RLS-bypassing update
      const newViewCount = (currentTopic.views_count || 0) + 1;

      await this.safeRpc(
        'increment_topic_views',
        { topic_id: id },
        async () => {
          // Fallback: Direct update with new count
          await this.admin
            .from('forum_topics')
            .update({
              views_count: newViewCount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        },
      );

      // Now fetch the complete topic data
      const { data: topic, error } = await this.admin
        .from('forum_topics')
        .select(
          `
          *,
          user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted),
          forum:forum_id(id, name, description, icon),
          forum_comments(
            id, content, created_at,
            user_profile:user_id(id, username, avatar, first_name_encrypted, last_name_encrypted),
            helpful_count, supportive_count, parent_comment_id
          )
        `,
        )
        .eq('id', id)
        .single();

      if (error || !topic) {
        throw error?.code === 'PGRST116'
          ? new NotFoundException('Topic not found')
          : new BadRequestException('Failed to fetch topic');
      }

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

        reactions?.forEach((r: any) => {
          if (r.reaction_type in userReactions) {
            userReactions[r.reaction_type as keyof UserReaction] = true;
          }
        });
      }

      // Apply identity reveal to topic author and comment authors
      if (userId) {
        const allItems = [topic, ...(topic.forum_comments || [])];
        await this.applyIdentityReveals(userId, allItems);
      }

      // Return with updated view count
      return {
        ...topic,
        views_count: newViewCount,
        reactions: {
          seen: topic.reaction_seen_count,
          validated: topic.reaction_validated_count,
          inspired: topic.reaction_inspired_count,
          heard: topic.reaction_heard_count,
        },
        userReactions,
        commentCount: topic.forum_comments?.length || 0,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Unexpected error fetching topic', { error });
      throw new InternalServerErrorException('Failed to fetch topic');
    }
  }

  async addReaction(
    topicId: string,
    userId: string,
    reactionType: 'seen' | 'validated' | 'inspired' | 'heard',
  ) {
    const reactionField = `reaction_${reactionType}_count` as const;

    try {
      const { data: existing } = await this.admin
        .from('topic_reactions')
        .select('id')
        .eq('topic_id', topicId)
        .eq('user_id', userId)
        .eq('reaction_type', reactionType)
        .maybeSingle();

      if (existing) {
        // Remove reaction
        await this.admin.from('topic_reactions').delete().eq('id', existing.id);

        // Get current count - FIXED: Proper type casting
        const { data: currentTopic } = await this.admin
          .from('forum_topics')
          .select(
            'reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count',
          )
          .eq('id', topicId)
          .single();

        const currentCount = (currentTopic as any)?.[reactionField] || 0;
        const newCount = Math.max(0, currentCount - 1);

        await this.safeRpc(
          'decrement_topic_reaction',
          { topic_id: topicId, reaction_field: reactionField },
          async () => {
            await this.admin
              .from('forum_topics')
              .update({
                [reactionField]: newCount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', topicId);
          },
        );

        await this.redis.delPattern('topics:*');

        return { action: 'removed' as const, reactionType };
      }

      // Check if topic exists and get creator info
      const { data: topic, error: topicError } = await this.admin
        .from('forum_topics')
        .select('id, user_id, title')
        .eq('id', topicId)
        .single();

      if (topicError || !topic) throw new NotFoundException('Topic not found');

      // Add reaction
      await this.admin.from('topic_reactions').insert({
        topic_id: topicId,
        user_id: userId,
        reaction_type: reactionType,
      });

      // Create notification for topic creator (only if not reacting to own topic)
      if (topic.user_id !== userId) {
        try {
          const { data: reactor } = await this.admin
            .from('user_profiles')
            .select('username')
            .eq('id', userId)
            .single();

          await this.notificationsService.createNotification({
            user_id: topic.user_id,
            actor_id: userId,
            type: 'forum_like',
            title: 'New Reaction',
            message: `${reactor?.username || 'Someone'} reacted with ${reactionType} to your topic`,
            action_url: `/forum/topics/${topicId}`,
            reference_id: topicId,
            reference_type: 'forum_topic',
            metadata: { reaction_type: reactionType },
            delivery_method: ['in_app'],
          });
        } catch (notifError) {
          console.error('Failed to create reaction notification:', notifError);
        }
      }

      // Get current count - FIXED: Proper type casting
      const { data: currentTopic } = await this.admin
        .from('forum_topics')
        .select(
          'reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count',
        )
        .eq('id', topicId)
        .single();

      const currentCount = (currentTopic as any)?.[reactionField] || 0;
      const newCount = currentCount + 1;

      await this.safeRpc(
        'increment_topic_reaction',
        { topic_id: topicId, reaction_field: reactionField },
        async () => {
          await this.admin
            .from('forum_topics')
            .update({
              [reactionField]: newCount,
              last_activity_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', topicId);
        },
      );

      await this.redis.delPattern('topics:*');

      // Invalidate AI insights cache for this topic
      this.okestraService.invalidateCache('topic', topicId).catch(() => {});

      return { action: 'added' as const, reactionType };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      logger.error('Failed to toggle reaction', { error });
      throw new InternalServerErrorException('Failed to update reaction');
    }
  }

  async deleteTopic(id: string, userId: string) {
    try {
      const { data: topic } = await this.admin
        .from('forum_topics')
        .select('id, user_id, forum_id')
        .eq('id', id)
        .single();

      if (!topic) throw new NotFoundException('Topic not found');
      if (topic.user_id !== userId)
        throw new ForbiddenException('Not authorized');

      await this.admin.from('forum_topics').delete().eq('id', id);

      // Get current forum topic count
      const { data: forum } = await this.admin
        .from('forums')
        .select('topic_count')
        .eq('id', topic.forum_id)
        .single();

      const currentCount = forum?.topic_count || 0;
      const newCount = Math.max(0, currentCount - 1);

      await this.safeRpc(
        'decrement_forum_topic_count',
        { forum_id: topic.forum_id },
        async () => {
          await this.admin
            .from('forums')
            .update({
              topic_count: newCount,
              last_activity: new Date().toISOString(),
            })
            .eq('id', topic.forum_id);
        },
      );

      await this.redis.delPattern('topics:*');

      return { success: true };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      logger.error('Failed to delete topic', { error });
      throw new InternalServerErrorException('Failed to delete topic');
    }
  }

  async findRecentDiscussions(
    filters: ForumFiltersDto,
    userId: string,
    companyName?: string,
  ) {
    const cacheKey = `topics:recent:${JSON.stringify(filters)}:${userId}:${companyName || 'all'}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    logger.info('Fetching recent discussions', {
      filters,
      userId,
      companyName,
    });

    try {
      const {
        search,
        sortBy = 'recent',
        timeFilter,
        category,
        page = 1,
        limit = 10,
      } = filters;

      const skip = (page - 1) * limit;

      // Get relevant forum IDs
      let forumQuery = this.admin
        .from('forums')
        .select('id')
        .or(
          `is_global.eq.true${companyName ? `,company_name.eq.${companyName}` : ''}`,
        );

      if (category) {
        forumQuery = forumQuery.eq('category', category);
      }

      const { data: forums, error: forumsError } = await forumQuery;

      if (forumsError) {
        logger.error('Failed to fetch forums for filtering', {
          error: forumsError.message,
        });
        throw new BadRequestException('Failed to fetch discussions');
      }

      // If no forums found, return empty result
      if (!forums || forums.length === 0) {
        return {
          topics: [],
          total: 0,
          page,
          totalPages: 0,
        };
      }

      const forumIds = forums.map((f) => f.id);

      // Query topics with optimized selection
      let query = this.admin
        .from('forum_topics')
        .select(
          `
        *,
        user_profile:user_id(
          id,
          username,
          avatar,
          first_name_encrypted,
          last_name_encrypted
        ),
        forum:forum_id(
          id,
          name,
          icon,
          is_global,
          company_name
        )
      `,
          { count: 'exact' },
        )
        .in('forum_id', forumIds);

      query = query.neq('user_id', userId);

      // Apply filters
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
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

      // Get user reactions in batch
      let userReactions: UserReactionsMap = {};
      if (userId && topics && topics.length > 0) {
        const topicIds = topics.map((t) => t.id);
        const { data: reactions } = await this.admin
          .from('topic_reactions')
          .select('topic_id, reaction_type')
          .eq('user_id', userId)
          .in('topic_id', topicIds);

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
          commentCount: topic.comments_count || 0,
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

      // Apply identity reveal
      if (userId) {
        await this.applyIdentityReveals(userId, formattedTopics);
      }

      logger.info('Recent discussions fetched successfully', {
        count: total,
        companyName,
        forumIdsCount: forumIds.length,
      });

      const result = {
        topics: formattedTopics,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };

      await this.redis.set(cacheKey, result, 180000);

      return result;
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

  async getMyTopics(userId: string, page: number = 1, limit: number = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: topics, error, count } = await this.admin
      .from('forum_topics')
      .select(`
        id, user_id, forum_id, title, content, is_anonymous, tags, scope,
        company_name, views_count, comments_count,
        reaction_seen_count, reaction_validated_count,
        reaction_inspired_count, reaction_heard_count,
        is_pinned, is_locked, created_at, updated_at,
        forum:forums(id, name),
        user_profile:user_id!inner(id, username, avatar, bio, first_name_encrypted, last_name_encrypted)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new BadRequestException('Failed to fetch your topics');
    }

    const formattedTopics = topics || [];
    await this.applyIdentityReveals(userId, formattedTopics);

    return {
      success: true,
      data: {
        topics: formattedTopics,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
          hasMore: (count || 0) > from + limit,
        },
      },
    };
  }

  async getBookmarkedTopics(userId: string, page: number = 1, limit: number = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get bookmarked topic IDs
    const { data: bookmarks, error: bmError } = await this.admin
      .from('feed_bookmarks')
      .select('content_id')
      .eq('user_id', userId)
      .eq('content_type', 'topic')
      .order('created_at', { ascending: false });

    if (bmError) {
      throw new BadRequestException('Failed to fetch bookmarked topics');
    }

    const topicIds = (bookmarks || []).map((b: any) => b.content_id);
    if (topicIds.length === 0) {
      return {
        success: true,
        data: {
          topics: [],
          pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        },
      };
    }

    const { data: topics, error, count } = await this.admin
      .from('forum_topics')
      .select(`
        id, user_id, forum_id, title, content, is_anonymous, tags, scope,
        company_name, views_count, comments_count,
        reaction_seen_count, reaction_validated_count,
        reaction_inspired_count, reaction_heard_count,
        is_pinned, is_locked, created_at, updated_at,
        forum:forums(id, name),
        user_profile:user_id!inner(id, username, avatar, bio, first_name_encrypted, last_name_encrypted)
      `, { count: 'exact' })
      .in('id', topicIds)
      .range(from, to);

    if (error) {
      throw new BadRequestException('Failed to fetch bookmarked topics');
    }

    const formattedTopics = topics || [];
    await this.applyIdentityReveals(userId, formattedTopics);

    return {
      success: true,
      data: {
        topics: formattedTopics,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
          hasMore: (count || 0) > from + limit,
        },
      },
    };
  }

  async toggleTopicBookmark(topicId: string, userId: string) {
    // Check if topic exists
    const { data: topic, error: topicErr } = await this.admin
      .from('forum_topics')
      .select('id')
      .eq('id', topicId)
      .single();

    if (topicErr || !topic) {
      throw new NotFoundException('Topic not found');
    }

    // Check if already bookmarked
    const { data: existing } = await this.admin
      .from('feed_bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('content_type', 'topic')
      .eq('content_id', topicId)
      .maybeSingle();

    if (existing) {
      await this.admin.from('feed_bookmarks').delete().eq('id', existing.id);
      return { success: true, data: { bookmarked: false }, message: 'Bookmark removed' };
    } else {
      await this.admin.from('feed_bookmarks').insert({
        user_id: userId,
        content_type: 'topic',
        content_id: topicId,
      });
      return { success: true, data: { bookmarked: true }, message: 'Topic bookmarked' };
    }
  }

  /**
   * Check identity reveals and add display_name to user_profile objects.
   * Items must have a user_profile object with id, username, first_name_encrypted, last_name_encrypted.
   */
  private async applyIdentityReveals(userId: string, items: any[]): Promise<void> {
    // Collect all other author IDs (self always gets real name)
    const otherAuthorIds = [...new Set(
      items
        .filter((item) => item.user_profile?.id && item.user_profile.id !== userId)
        .map((item) => item.user_profile.id),
    )];

    // Get revealed IDs using shared utility
    const revealedIds = await this.identityReveal.getRevealedUserIds(userId, otherAuthorIds);

    items.forEach((item) => {
      if (!item.user_profile) return;

      const isOwnContent = item.user_profile.id === userId;
      const isRevealed = revealedIds.has(item.user_profile.id);

      let displayName = item.is_anonymous ? 'Anonymous User' : item.user_profile.username;

      // Don't reveal real name on anonymous content
      if (!item.is_anonymous && (isOwnContent || isRevealed)) {
        const realName = this.identityReveal.decryptRealName(
          item.user_profile.first_name_encrypted,
          item.user_profile.last_name_encrypted,
        );
        if (realName) displayName = realName;
      }

      item.user_profile.display_name = displayName;
      delete item.user_profile.first_name_encrypted;
      delete item.user_profile.last_name_encrypted;
    });
  }
}
