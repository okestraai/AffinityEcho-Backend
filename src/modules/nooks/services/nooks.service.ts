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

@Injectable()
export class NooksService {
  private admin;

  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private identityReveal: IdentityRevealUtil,
    private encryption: EncryptionUtil,
    private okestraService: OkestraService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  async findAll(query: NookQueryDto, userId: string) {
    const cacheKey = `nooks:list:${JSON.stringify(query)}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

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
      .neq('creator_id', userId);

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

    return result;
  }

  async create(createNookDto: CreateNookDto, userId: string) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

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

    await this.redis.delPattern('nooks:*');

    return {
      success: true,
      data: { nook },
      message: 'Nook created successfully',
    };
  }

  async findOne(id: string, userId: string) {
    // Get nook
    const { data: nook, error } = await this.admin
      .from('nooks')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !nook) throw new NotFoundException('Nook not found');

    if (!nook.is_active || new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException('Nook is expired or inactive');
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

  async remove(id: string) {
    // First check if nook exists
    const { data: nook, error: fetchError } = await this.admin
      .from('nooks')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (fetchError || !nook) throw new NotFoundException('Nook not found');

    // Delete nook
    const { error } = await this.admin.from('nooks').delete().eq('id', id);

    if (error) throw new BadRequestException(error.message);

    await this.redis.delPattern('nooks:*');

    return {
      success: true,
      message: 'Nook deleted successfully',
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
      message: 'Nook locked successfully',
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
      totalNooksResult,
      messagesTodayResult,
      anonymousInActiveResult,
      hotNooksResult,
      messageSendersResult, // only user_id column
    ] = await Promise.all([
      // Active Nooks count (head: true = no data returned, only count)
      this.admin
        .from('nooks')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('expires_at', now),

      // Total Nooks count
      this.admin.from('nooks').select('*', { count: 'exact', head: true }),

      // Messages today count
      this.admin
        .from('nook_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay.toISOString()),

      // Anonymous members in active nooks only
      activeNookIds.length > 0
        ? this.admin
            .from('nook_members')
            .select('id', { count: 'exact', head: true })
            .eq('is_anonymous', true)
            .in('nook_id', activeNookIds)
        : Promise.resolve({ count: 0 }), // ← optimization: skip query if no active nooks

      // Hot Nooks count
      this.admin
        .from('nooks')
        .select('*', { count: 'exact', head: true })
        .eq('temperature', 'hot'),

      // Fetch only user_id column for unique senders (minimal data transfer)
      this.admin
        .from('nook_messages')
        .select('user_id') // ← only one column
        .not('user_id', 'is', null),
    ]);

    // Compute unique senders using Set (very fast even with thousands of rows)
    const uniqueMessageSenders = new Set(
      messageSendersResult?.data?.map(
        (row: { user_id: string }) => row.user_id,
      ) || [],
    ).size;

    const result = {
      success: true,
      data: {
        activeNooks: activeNooksResult.count || 0,
        totalNooks: totalNooksResult.count || 0,
        anonymousUsers: anonymousInActiveResult.count || 0,
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
      throw new NotFoundException('Message not found');

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
      message: 'Message flagged for moderation',
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
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new BadRequestException('Failed to fetch your nooks');

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

    if (bmError)
      throw new BadRequestException('Failed to fetch bookmarked nooks');

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
      .gt('expires_at', new Date().toISOString())
      .range(from, to);

    if (error)
      throw new BadRequestException('Failed to fetch bookmarked nooks');

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

    if (nookErr || !nook) throw new NotFoundException('Nook not found');

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
        message: 'Bookmark removed',
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
        message: 'Nook bookmarked',
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

    items.forEach((item) => {
      if (!item.user_profile) return;

      const isOwnContent = item[ownerField] === userId;
      const isRevealed = revealedIds.has(item.user_profile.id);

      let displayName = item.user_profile.username || 'Unknown';

      if (isOwnContent || isRevealed) {
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

  private calculateTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }
}
