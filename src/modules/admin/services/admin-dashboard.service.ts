import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class AdminDashboardService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async getOverview() {
    try {
      const todayStart = new Date(
        new Date().setHours(0, 0, 0, 0),
      ).toISOString();
      const weekAgo = this.daysAgo(7);

      const [
        usersResult,
        reportsResult,
        forumsResult,
        activeSessionsResult,
        pendingRequestsResult,
        completedSessionsResult,
        feedPostsTodayResult,
        forumTopicsTodayResult,
        nookMessagesTodayResult,
        hiddenContentResult,
        signupsChartResult,
        reportsChartResult,
      ] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select(
            'id, is_suspended, is_deactivated, is_deleted, created_at, last_active_at',
          ),
        this.admin
          .from('harassment_reports')
          .select('id, status, immediate_risk, created_at'),
        this.admin
          .from('forums')
          .select('id, is_global')
          .is('deleted_at', null),
        this.admin
          .from('mentorship_sessions')
          .select('id', { count: 'exact' })
          .eq('status', 'scheduled'),
        this.admin
          .from('mentorship_direct_requests')
          .select('id', { count: 'exact' })
          .eq('status', 'pending'),
        this.admin
          .from('mentorship_sessions')
          .select('id', { count: 'exact' })
          .eq('status', 'completed')
          .gte(
            'created_at',
            new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1,
            ).toISOString(),
          ),
        this.admin
          .from('feed_posts')
          .select('id', { count: 'exact' })
          .gte('created_at', todayStart),
        this.admin
          .from('forum_topics')
          .select('id', { count: 'exact' })
          .gte('created_at', todayStart),
        this.admin
          .from('nook_messages')
          .select('id', { count: 'exact' })
          .gte('created_at', todayStart),
        this.admin
          .from('content_moderation')
          .select('id', { count: 'exact' })
          .in('moderation_status', ['hidden', 'removed']),
        this.admin
          .from('user_profiles')
          .select('created_at')
          .gte('created_at', weekAgo),
        this.admin
          .from('harassment_reports')
          .select('created_at')
          .gte('created_at', weekAgo),
      ]);

      const allUsers: any[] = usersResult.data || [];
      const allReports: any[] = reportsResult.data || [];
      const allForums: any[] = forumsResult.data || [];
      const weekAgoDate = new Date(weekAgo);

      const activeToday = allUsers.filter(
        (u) =>
          u.last_active_at &&
          new Date(u.last_active_at) >=
            new Date(new Date().setHours(0, 0, 0, 0)),
      ).length;

      return {
        success: true,
        data: {
          users: {
            total: allUsers.length,
            active_today: activeToday,
            new_this_week: allUsers.filter(
              (u) => new Date(u.created_at) >= weekAgoDate,
            ).length,
            suspended: allUsers.filter((u) => u.is_suspended).length,
            deactivated: allUsers.filter(
              (u) => u.is_deactivated && !u.is_deleted,
            ).length,
            deleted: allUsers.filter((u) => u.is_deleted).length,
          },
          reports: {
            total: allReports.length,
            submitted: allReports.filter((r) => r.status === 'submitted')
              .length,
            under_review: allReports.filter((r) => r.status === 'under_review')
              .length,
            resolved_this_week: allReports.filter(
              (r) =>
                r.status === 'resolved' &&
                new Date(r.created_at) >= weekAgoDate,
            ).length,
            high_priority: allReports.filter((r) => r.immediate_risk).length,
          },
          content: {
            feed_posts_today: feedPostsTodayResult.count ?? 0,
            forum_topics_today: forumTopicsTodayResult.count ?? 0,
            nook_messages_today: nookMessagesTodayResult.count ?? 0,
            hidden_content_total: hiddenContentResult.count ?? 0,
          },
          forums: {
            total: allForums.length,
            global: allForums.filter((f) => f.is_global).length,
            company_based: allForums.filter((f) => !f.is_global).length,
          },
          mentorship: {
            active_sessions: activeSessionsResult.count ?? 0,
            pending_requests: pendingRequestsResult.count ?? 0,
            completed_this_month: completedSessionsResult.count ?? 0,
          },
          chart: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            user_signups_7d: this.buildDailyChart(
              signupsChartResult.data || [],
            ),
            reports_7d: this.buildDailyChart(reportsChartResult.data || []),
          },
        },
      };
    } catch (error: any) {
      logger.error('Admin dashboard failed', { error: error.message });
      throw error;
    }
  }

  private daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  private buildDailyChart(rows: Array<{ created_at: string }>): number[] {
    const counts = new Array(7).fill(0);
    const now = new Date();
    for (const row of rows) {
      const diffDays = Math.floor(
        (now.getTime() - new Date(row.created_at).getTime()) / 86400000,
      );
      if (diffDays >= 0 && diffDays < 7) counts[6 - diffDays]++;
    }
    return counts;
  }
}
