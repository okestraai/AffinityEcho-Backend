import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateNookDto } from '../dto/create-nook.dto';
import { NookQueryDto } from '../dto/nook-query.dto';
import { supabaseAdmin } from '../../../database/supabase.client';
import { RedisService } from '../../../common/services/redis.service';
import { IdentityRevealUtil } from '../../../common/utils/identity-reveal.util';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { OkestraService } from '../../okestra/services/okestra.service';
import { ContentSafetyService } from '../../content-safety/content-safety.service';
import { MSG } from '../../../common/constants/messages';
import logger from '../../../common/utils/logger.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NooksService {
  private admin;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private identityReveal: IdentityRevealUtil,
    private encryption: EncryptionUtil,
    private okestraService: OkestraService,
    private contentSafety: ContentSafetyService,
    @InjectQueue('moderation') private moderationQueue: Queue,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async findAll(query: NookQueryDto, userId: string) {
    const cacheKey = `nooks:list:${JSON.stringify(query)}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      // Apply hidden content filter post-cache so hides take effect immediately
      const hiddenIds = await this.contentSafety.getHiddenContentIds(userId, 'nook');
      if (hiddenIds.length > 0) {
        const hiddenSet = new Set(hiddenIds);
        cached.data.nooks = cached.data.nooks.filter((n: any) => !hiddenSet.has(n.id));
      }
      return cached;
    }

    const { page = 1, limit = 8, ...filters } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query
    let supabaseQuery = this.admin
      .from('nooks')
      .select(
        `*, user_profile:creator_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted, is_company_verified)`,
        { count: 'exact' },
      )
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .neq('creator_id', userId)
      .or('is_hidden.is.null,is_hidden.eq.false');

    // Apply filters
    if (filters.urgency && filters.urgency !== 'all') {
      supabaseQuery = supabaseQuery.eq('urgency', filters.urgency);
    }

    if (filters.scope && filters.scope !== 'all') {
      supabaseQuery = supabaseQuery.eq('scope', filters.scope);
    }

    if (filters.temperature && filters.temperature !== 'all') {
      supabaseQuery = supabaseQuery.eq('temperature', filters.temperature);
    }

    if (filters.hashtag) {
      supabaseQuery = supabaseQuery.contains('hashtags', [filters.hashtag]);
    }

    // Apply sorting
    if (query.sortBy === 'trending') {
      // Trending: only show nooks from last 7 days, sorted by activity
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      supabaseQuery = supabaseQuery
        .gte('created_at', sevenDaysAgo)
        .order('messages_count', { ascending: false });
    } else if (query.sortBy) {
      const order = query.sortOrder === 'asc' ? true : false;
      supabaseQuery = supabaseQuery.order(query.sortBy, { ascending: order });
    } else {
      supabaseQuery = supabaseQuery.order('created_at', { ascending: false });
    }

    // Apply pagination
    supabaseQuery = supabaseQuery.range(from, to);

    const { data: nooks, error, count } = await supabaseQuery;

    if (error) throw new BadRequestException(error.message);

    const formattedNooks = (nooks || []).map((nook: any) => ({
      ...nook,
      timeLeft: this.calculateTimeLeft(new Date(nook.expires_at)),
    }));

    await this.applyIdentityReveals(userId, formattedNooks, 'creator_id');

    const result = {
      success: true,
      data: {
        nooks: formattedNooks,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    };

    await this.redis.set(cacheKey, result, 120000);

    // Apply hidden content filter post-cache so hides take effect immediately
    const hiddenIds = await this.contentSafety.getHiddenContentIds(userId, 'nook');
    if (hiddenIds.length > 0) {
      const hiddenSet = new Set(hiddenIds);
      result.data.nooks = result.data.nooks.filter((n: any) => !hiddenSet.has(n.id));
    }

    return result;
  }

  async create(createNookDto: CreateNookDto, userId: string) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const insertData: any = {
      ...createNookDto,
      creator_id: userId,
      expires_at: expiresAt.toISOString(),
    };

    // Stamp company_name on company-scoped nooks
    if (createNookDto.scope === 'company') {
      const { data: userProfile } = await this.admin
        .from('user_profiles')
        .select('company_encrypted')
        .eq('id', userId)
        .single();

      if (userProfile?.company_encrypted) {
        try {
          insertData.company_name = this.encryption.decrypt(
            userProfile.company_encrypted,
          );
        } catch (e) {
          // Skip stamping if decryption fails
        }
      }
    }

    const { data: nook, error } = await this.admin
      .from('nooks')
      .insert([insertData])
      .select(
        `
        id,
        title,
        description,
        urgency,
        scope,
        hashtags,
        creator_id,
        members_count,
        messages_count,
        expires_at,
        created_at
      `,
      )
      .single();

    if (error) throw new BadRequestException(error.message);

    // Auto-join creator to nook
    await this.admin.from('nook_members').insert([
      {
        nook_id: nook.id,
        user_id: userId,
        is_anonymous: false,
      },
    ]);

    // Enqueue AI moderation (fire-and-forget — never blocks the user)
    this.moderationQueue.add('moderate', {
      contentType: 'nook',
      contentId: nook.id,
      authorId: userId,
    }, { jobId: `nook-${nook.id}` }).then(() => {
      logger.info('Moderation queued', { contentType: 'nook', contentId: nook.id });
    }).catch(mqErr => {
      logger.warn('Failed to enqueue moderation', { nookId: nook.id, error: mqErr });
    });

    await this.redis.delPattern('nooks:*');

    return {
      success: true,
      data: { nook },
      message: MSG.NOOK.CREATED,
    };
  }

  async findOne(id: string, userId: string) {
    // Get nook
    const { data: nook, error } = await this.admin
      .from('nooks')
      .select('*')
      .eq('id', id)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .single();

    if (error || !nook) throw new NotFoundException(MSG.NOOK.NOT_FOUND);

    if (!nook.is_active || new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException(MSG.NOOK.EXPIRED);
    }

    // Increment views count
    await this.admin
      .from('nooks')
      .update({ views_count: (nook.views_count || 0) + 1 })
      .eq('id', id);

    // Check membership and creator status
    const [membership, isCreator] = await Promise.all([
      this.admin
        .from('nook_members')
        .select('id')
        .eq('nook_id', id)
        .eq('user_id', userId)
        .maybeSingle(),
      this.admin
        .from('nooks')
        .select('id')
        .eq('id', id)
        .eq('creator_id', userId)
        .maybeSingle(),
    ]);

    return {
      success: true,
      data: {
        nook: {
          ...nook,
          timeLeft: this.calculateTimeLeft(new Date(nook.expires_at)),
        },
        isMember: !!membership.data,
        isCreator: !!isCreator.data,
      },
    };
  }

  async update(
    id: string,
    userId: string,
    dto: {
      title?: string;
      description?: string;
      urgency?: string;
      scope?: string;
      hashtags?: string[];
    },
  ) {
    logger.info('Updating nook', { nookId: id, userId });

    try {
      const { data: nook, error: fetchError } = await this.admin
        .from('nooks')
        .select('id, creator_id, deleted_at, is_hidden, is_locked')
        .eq('id', id)
        .single();

      if (fetchError || !nook)
        throw new NotFoundException(MSG.NOOK.NOT_FOUND);
      if (nook.creator_id !== userId)
        throw new ForbiddenException('You can only edit your own nooks');
      if (nook.deleted_at)
        throw new NotFoundException(MSG.NOOK.NOT_FOUND);
      if (nook.is_hidden)
        throw new ForbiddenException('This nook is under moderation review');
      if (nook.is_locked)
        throw new ForbiddenException('This nook is locked');

      const updateData: any = {
        updated_at: new Date().toISOString(),
        is_edited: true,
      };

      if (dto.title !== undefined) {
        if (!dto.title || dto.title.trim().length === 0)
          throw new BadRequestException('Title cannot be empty');
        if (dto.title.length > 200)
          throw new BadRequestException('Title must be 200 characters or less');
        updateData.title = dto.title.trim();
      }
      if (dto.description !== undefined) {
        if (dto.description.length > 2000)
          throw new BadRequestException(
            'Description must be 2000 characters or less',
          );
        updateData.description = dto.description.trim();
      }
      if (dto.urgency !== undefined) {
        if (!['high', 'medium', 'low'].includes(dto.urgency))
          throw new BadRequestException(
            'Urgency must be high, medium, or low',
          );
        updateData.urgency = dto.urgency;
      }
      if (dto.scope !== undefined) {
        if (!['global', 'company'].includes(dto.scope))
          throw new BadRequestException('Scope must be global or company');
        updateData.scope = dto.scope;
      }
      if (dto.hashtags !== undefined) {
        if (dto.hashtags.length > 10)
          throw new BadRequestException('Maximum 10 hashtags allowed');
        updateData.hashtags = dto.hashtags;
      }

      if (Object.keys(updateData).length <= 2)
        throw new BadRequestException('At least one field is required');

      const { data: updated, error: updateError } = await this.admin
        .from('nooks')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (updateError) {
        logger.error('Failed to update nook', { error: updateError });
        throw new BadRequestException('Failed to update nook');
      }

      await this.redis.delPattern('nooks:*');

      return {
        success: true,
        data: updated,
        message: 'Nook updated successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;
      logger.error('Unexpected error updating nook', { error });
      throw new BadRequestException('Failed to update nook');
    }
  }

  async remove(id: string, userId?: string) {
    const { data: nook, error: fetchError } = await this.admin
      .from('nooks')
      .select('creator_id, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !nook) throw new NotFoundException(MSG.NOOK.NOT_FOUND);
    if (nook.deleted_at) throw new NotFoundException(MSG.NOOK.NOT_FOUND);
    if (userId && nook.creator_id !== userId)
      throw new ForbiddenException('You can only delete your own nooks');

    const now = new Date().toISOString();

    // Soft-delete all nook_messages
    await this.admin
      .from('nook_messages')
      .update({ is_deleted: true, deleted_at: now })
      .eq('nook_id', id);

    // Delete nook_reactions
    await this.admin.from('nook_reactions').delete().eq('nook_id', id);

    // Delete nook_members
    await this.admin.from('nook_members').delete().eq('nook_id', id);

    // Soft-delete the nook (use existing deleted_at column)
    const { error } = await this.admin
      .from('nooks')
      .update({ deleted_at: now })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);

    await this.redis.delPattern('nooks:*');
    await this.redis.delPattern('feeds:*');

    return {
      success: true,
      message: MSG.NOOK.DELETED,
    };
  }

  async lock(id: string, reason: string) {
    const { error } = await this.admin
      .from('nooks')
      .update({
        is_locked: true,
        locked_reason: reason,
      })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);

    await this.redis.delPattern('nooks:*');

    // Invalidate AI insights cache for this nook
    this.okestraService.invalidateCache('nook', id).catch(() => {});

    return {
      success: true,
      message: MSG.NOOK.LOCKED,
    };
  }

  async getGlobalStats() {
    const cacheKey = 'nooks:stats';
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const now = new Date().toISOString();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Step 1: Fetch active nook IDs (only 'id' column - very cheap)
    const { data: activeNookIdsData, error: idsError } = await this.admin
      .from('nooks')
      .select('id') // ← only id, minimal data transfer
      .eq('is_active', true)
      .gt('expires_at', now);

    if (idsError) {
      console.error('Failed to fetch active nook IDs:', idsError);
    }

    const activeNookIds =
      activeNookIdsData?.map((row: { id: string }) => row.id) ?? [];

    // Step 2: Parallel queries - all lightweight
    const [
      activeNooksResult,
      allTimeNooksResult,
      messagesTodayResult,
      inANookNowResult,
      hotNooksResult,
      allTimeMessagesResult,
      allTimeReactionsResult,
      allTimeMembersResult,
      messageSendersResult,
    ] = await Promise.all([
      // Active Nooks count
      this.admin
        .from('nooks')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('expires_at', now),

      // All Time Nooks Created
      this.admin.from('nooks').select('*', { count: 'exact', head: true }),

      // Messages today count
      this.admin
        .from('nook_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay.toISOString()),

      // In a Nook Now — distinct users in active nooks
      activeNookIds.length > 0
        ? this.admin
            .from('nook_members')
            .select('user_id')
            .in('nook_id', activeNookIds)
        : Promise.resolve({ data: [] }),

      // Hot Nooks count
      this.admin
        .from('nooks')
        .select('*', { count: 'exact', head: true })
        .eq('temperature', 'hot'),

      // All time nook messages count
      this.admin
        .from('nook_messages')
        .select('*', { count: 'exact', head: true }),

      // All time nook reactions count
      this.admin
        .from('nook_reactions')
        .select('*', { count: 'exact', head: true }),

      // All time nook member joins count
      this.admin
        .from('nook_members')
        .select('*', { count: 'exact', head: true }),

      // Unique message senders (for totalMessageParticipants)
      this.admin
        .from('nook_messages')
        .select('user_id')
        .not('user_id', 'is', null),
    ]);

    // Distinct users currently in active nooks
    const inANookNow = new Set(
      inANookNowResult?.data?.map(
        (row: { user_id: string }) => row.user_id,
      ) || [],
    ).size;

    // All time interactions = messages + reactions + member joins
    const allTimeNookInteractions =
      (allTimeMessagesResult.count || 0) +
      (allTimeReactionsResult.count || 0) +
      (allTimeMembersResult.count || 0);

    // Unique message senders
    const uniqueMessageSenders = new Set(
      messageSendersResult?.data?.map(
        (row: { user_id: string }) => row.user_id,
      ) || [],
    ).size;

    const result = {
      success: true,
      data: {
        activeNooks: activeNooksResult.count || 0,
        inANookNow: inANookNow,
        allTimeNooksCreated: allTimeNooksResult.count || 0,
        allTimeNookInteractions: allTimeNookInteractions,
        messagesToday: messagesTodayResult.count || 0,
        hotNooks: hotNooksResult.count || 0,
        totalMessageParticipants: uniqueMessageSenders,
      },
    };

    await this.redis.set(cacheKey, result, 300000);

    return result;
  }

  async flagMessage(
    nookId: string,
    messageId: string,
    reason: string,
    userId: string,
  ) {
    // First get current flagged count
    const { data: message, error: fetchError } = await this.admin
      .from('nook_messages')
      .select('flagged_count')
      .eq('id', messageId)
      .eq('nook_id', nookId)
      .single();

    if (fetchError || !message)
      throw new NotFoundException(MSG.NOOK.MESSAGE_NOT_FOUND);

    const { error } = await this.admin
      .from('nook_messages')
      .update({
        is_flagged: true,
        flagged_count: (message.flagged_count || 0) + 1,
      })
      .eq('id', messageId);

    if (error) throw new BadRequestException(error.message);

    // TODO: Create moderation record
    return {
      success: true,
      message: MSG.NOOK.FLAGGED,
    };
  }

  async getMyNooks(userId: string, page: number = 1, limit: number = 8) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const {
      data: nooks,
      error,
      count,
    } = await this.admin
      .from('nooks')
      .select(
        `*, user_profile:creator_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted, is_company_verified)`,
        { count: 'exact' },
      )
      .eq('creator_id', userId)
      .eq('is_active', true)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new BadRequestException(MSG.NOOK.YOUR_NOOKS_FAILED);

    const formattedNooks = (nooks || []).map((nook: any) => ({
      ...nook,
      timeLeft: this.calculateTimeLeft(new Date(nook.expires_at)),
    }));

    await this.applyIdentityReveals(userId, formattedNooks, 'creator_id');

    return {
      success: true,
      data: {
        nooks: formattedNooks,
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

  async getBookmarkedNooks(
    userId: string,
    page: number = 1,
    limit: number = 8,
  ) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get bookmarked nook IDs
    const { data: bookmarks, error: bmError } = await this.admin
      .from('feed_bookmarks')
      .select('content_id')
      .eq('user_id', userId)
      .eq('content_type', 'nook_message')
      .order('created_at', { ascending: false });

    if (bmError) throw new BadRequestException(MSG.NOOK.BOOKMARKS_FAILED);

    const nookIds = (bookmarks || []).map((b: any) => b.content_id);
    if (nookIds.length === 0) {
      return {
        success: true,
        data: {
          nooks: [],
          pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
        },
      };
    }

    const {
      data: nooks,
      error,
      count,
    } = await this.admin
      .from('nooks')
      .select(
        `*, user_profile:creator_id(id, username, avatar, bio, first_name_encrypted, last_name_encrypted, is_company_verified)`,
        { count: 'exact' },
      )
      .in('id', nookIds)
      .eq('is_active', true)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .gt('expires_at', new Date().toISOString())
      .range(from, to);

    if (error) throw new BadRequestException(MSG.NOOK.BOOKMARKS_FAILED);

    const formattedNooks = (nooks || []).map((nook: any) => ({
      ...nook,
      timeLeft: this.calculateTimeLeft(new Date(nook.expires_at)),
    }));

    await this.applyIdentityReveals(userId, formattedNooks, 'creator_id');

    return {
      success: true,
      data: {
        nooks: formattedNooks,
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

  async toggleNookBookmark(nookId: string, userId: string) {
    // Check if nook exists
    const { data: nook, error: nookErr } = await this.admin
      .from('nooks')
      .select('id')
      .eq('id', nookId)
      .single();

    if (nookErr || !nook) throw new NotFoundException(MSG.NOOK.NOT_FOUND);

    // Check if already bookmarked
    const { data: existing } = await this.admin
      .from('feed_bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('content_type', 'nook_message')
      .eq('content_id', nookId)
      .maybeSingle();

    if (existing) {
      await this.admin.from('feed_bookmarks').delete().eq('id', existing.id);
      return {
        success: true,
        data: { bookmarked: false },
        message: MSG.NOOK.BOOKMARK_REMOVED,
      };
    } else {
      await this.admin.from('feed_bookmarks').insert({
        user_id: userId,
        content_type: 'nook_message',
        content_id: nookId,
      });
      return {
        success: true,
        data: { bookmarked: true },
        message: MSG.NOOK.BOOKMARKED,
      };
    }
  }

  private async applyIdentityReveals(
    userId: string,
    items: any[],
    ownerField: string = 'creator_id',
  ): Promise<void> {
    const otherAuthorIds = [
      ...new Set(
        items
          .filter(
            (item) => item.user_profile?.id && item.user_profile.id !== userId,
          )
          .map((item) => item.user_profile.id),
      ),
    ];

    const revealedIds =
      otherAuthorIds.length > 0
        ? await this.identityReveal.getRevealedUserIds(userId, otherAuthorIds)
        : new Set<string>();

    const nameCache = new Map<string, string | null>();

    items.forEach((item) => {
      if (!item.user_profile) return;

      const authorId = item.user_profile.id || item[ownerField];
      const isOwnContent = item[ownerField] === userId;
      const isRevealed = revealedIds.has(authorId);

      let displayName = item.user_profile.username || 'Unknown';

      if (isOwnContent || isRevealed) {
        if (!nameCache.has(authorId)) {
          nameCache.set(
            authorId,
            this.identityReveal.decryptRealName(
              item.user_profile.first_name_encrypted,
              item.user_profile.last_name_encrypted,
            ),
          );
        }
        const realName = nameCache.get(authorId);
        if (realName) displayName = realName;
      }

      item.user_profile.display_name = displayName;
    });

    items.forEach((item) => {
      if (item.user_profile) {
        delete item.user_profile.first_name_encrypted;
        delete item.user_profile.last_name_encrypted;
      }
    });
  }

  private calculateTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }
}
