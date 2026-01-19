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

@Injectable()
export class NooksService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async findAll(query: NookQueryDto) {
    const { page = 1, limit = 8, ...filters } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query
    let supabaseQuery = this.admin
      .from('nooks')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());

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
    if (query.sortBy) {
      const order = query.sortOrder === 'asc' ? true : false;
      supabaseQuery = supabaseQuery.order(query.sortBy, { ascending: order });
    } else {
      supabaseQuery = supabaseQuery.order('created_at', { ascending: false });
    }

    // Apply pagination
    supabaseQuery = supabaseQuery.range(from, to);

    const { data: nooks, error, count } = await supabaseQuery;

    if (error) throw new BadRequestException(error.message);

    const formattedNooks = (nooks || []).map((nook) => ({
      ...nook,
      timeLeft: this.calculateTimeLeft(new Date(nook.expires_at)),
    }));

    return {
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
  }

  async create(createNookDto: CreateNookDto, userId: string) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: nook, error } = await this.admin
      .from('nooks')
      .insert([
        {
          ...createNookDto,
          creator_id: userId,
          expires_at: expiresAt.toISOString(),
        },
      ])
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

    return {
      success: true,
      message: 'Nook locked successfully',
    };
  }

  async getGlobalStats() {
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

    return {
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

  private calculateTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }
}
