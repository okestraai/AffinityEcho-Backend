import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import { buildMeta, parsePagination } from '../admin.helpers';

@Injectable()
export class AdminLogsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getLogs(query: {
    page?: string; limit?: string; search?: string;
    adminId?: string; action?: string; targetType?: string;
    from?: string; to?: string; sortDir?: string;
  }) {
    const { page, pageSize, offset } = parsePagination(query.page, query.limit, 10, 200);
    const ascending = query.sortDir === 'asc';

    let q = this.admin
      .from('admin_logs')
      .select(
        `id, action, target_type, target_id, reason, metadata, ip_address, created_at, admin_username,
         admin:user_profiles!admin_id(id, username, avatar)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending })
      .range(offset, offset + pageSize - 1);

    if (query.adminId) q = q.eq('admin_id', query.adminId);
    if (query.action) q = q.eq('action', query.action);
    if (query.targetType) q = q.eq('target_type', query.targetType);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);
    if (query.search) {
      q = q.or(`admin_username.ilike.%${query.search}%,action.ilike.%${query.search}%,reason.ilike.%${query.search}%`);
    }

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);

    return {
      success: true,
      data: data ?? [],
      meta: buildMeta(page, pageSize, count ?? 0),
    };
  }
}
