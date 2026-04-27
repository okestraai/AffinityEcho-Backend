import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class AdminAnalyticsService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Full analytics dashboard — signup, engagement, retention, top content
   */
  async getAnalytics() {
    try {
      const now = new Date();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      const weekAgo = this.daysAgo(7);
      const monthAgo = this.daysAgo(30);
      const threeMonthsAgo = this.daysAgo(90);

      const [
        allUsersResult,
        postsWeek,
        postsMonth,
        topicsWeek,
        topicsMonth,
        feedCommentsWeek,
        forumCommentsWeek,
        messagesWeek,
        messagesMonth,
        activeConversations,
        activeNooks,
        mentorshipRelationships,
        revealAccepted,
        signups30d,
        reportsResult,
        moderationResult,
      ] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select(
            'id, auth_provider, has_completed_onboarding, is_company_verified, is_suspended, is_deactivated, is_deleted, created_at, last_active_at',
          ),
        this.admin
          .from('feed_posts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo),
        this.admin
          .from('feed_posts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', monthAgo),
        this.admin
          .from('forum_topics')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo),
        this.admin
          .from('forum_topics')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', monthAgo),
        this.admin
          .from('feed_comments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo),
        this.admin
          .from('forum_comments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo),
        this.admin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo),
        this.admin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', monthAgo),
        this.admin
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .gte('updated_at', weekAgo),
        this.admin
          .from('nooks')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .gt('expires_at', now.toISOString()),
        this.admin
          .from('mentorship_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
        this.admin
          .from('identity_reveals')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'accepted'),
        this.admin
          .from('user_profiles')
          .select('created_at')
          .gte('created_at', monthAgo),
        this.admin
          .from('harassment_reports')
          .select('id, status, category, created_at, resolved_at'),
        this.admin
          .from('content_moderation')
          .select('id, moderation_status, created_at')
          .gte('created_at', weekAgo),
      ]);

      const users: any[] = allUsersResult.data || [];
      const activeUsers = users.filter(
        (u) => !u.is_suspended && !u.is_deactivated && !u.is_deleted,
      );
      const todayISO = new Date(todayStart).toISOString();
      const weekAgoDate = new Date(weekAgo);
      const monthAgoDate = new Date(monthAgo);

      // Signup analytics
      const completed = users.filter((u) => u.has_completed_onboarding);
      const notCompleted = users.filter((u) => !u.has_completed_onboarding);
      const byProvider: Record<string, number> = {};
      users.forEach((u) => {
        const provider = u.auth_provider || 'email';
        byProvider[provider] = (byProvider[provider] || 0) + 1;
      });

      const signupsToday = users.filter((u) => u.created_at >= todayISO).length;
      const signupsWeek = users.filter(
        (u) => new Date(u.created_at) >= weekAgoDate,
      ).length;
      const signupsMonth = users.filter(
        (u) => new Date(u.created_at) >= monthAgoDate,
      ).length;

      // Engagement analytics
      const dau = activeUsers.filter(
        (u) => u.last_active_at && u.last_active_at >= todayISO,
      ).length;
      const wau = activeUsers.filter(
        (u) => u.last_active_at && new Date(u.last_active_at) >= weekAgoDate,
      ).length;
      const mau = activeUsers.filter(
        (u) => u.last_active_at && new Date(u.last_active_at) >= monthAgoDate,
      ).length;

      // Retention (simple: signed up this month and still active)
      const recentSignups = users.filter(
        (u) => new Date(u.created_at) >= monthAgoDate,
      );
      const d7Retained = recentSignups.filter((u) => {
        if (!u.last_active_at) return false;
        const signupDate = new Date(u.created_at);
        const lastActive = new Date(u.last_active_at);
        return lastActive.getTime() - signupDate.getTime() >= 7 * 86400000;
      }).length;
      const d30Retained = recentSignups.filter((u) => {
        if (!u.last_active_at) return false;
        const signupDate = new Date(u.created_at);
        const lastActive = new Date(u.last_active_at);
        return lastActive.getTime() - signupDate.getTime() >= 30 * 86400000;
      }).length;
      const churned = users.filter((u) => {
        if (u.is_deleted || u.is_deactivated) return false;
        const created = new Date(u.created_at);
        if (now.getTime() - created.getTime() < 30 * 86400000) return false;
        if (!u.last_active_at) return true;
        return (
          now.getTime() - new Date(u.last_active_at).getTime() > 30 * 86400000
        );
      }).length;

      // Moderation stats
      const reports: any[] = reportsResult.data || [];
      const reportsThisWeek = reports.filter(
        (r) => new Date(r.created_at) >= weekAgoDate,
      ).length;
      const resolvedReports = reports.filter(
        (r) => r.status === 'resolved' && r.resolved_at,
      );
      const avgResolveTime =
        resolvedReports.length > 0
          ? resolvedReports.reduce((sum, r) => {
              return (
                sum +
                (new Date(r.resolved_at).getTime() -
                  new Date(r.created_at).getTime())
              );
            }, 0) /
            resolvedReports.length /
            3600000
          : 0;
      const reportsByCategory: Record<string, number> = {};
      reports.forEach((r) => {
        const cat = r.category || 'uncategorized';
        reportsByCategory[cat] = (reportsByCategory[cat] || 0) + 1;
      });
      const hiddenThisWeek = (moderationResult.data || []).filter(
        (m: any) =>
          m.moderation_status === 'hidden' || m.moderation_status === 'removed',
      ).length;

      // 30-day signup chart
      const signupChart = this.buildDailyChart(signups30d.data || [], 30);

      return {
        success: true,
        data: {
          signups: {
            total: users.length,
            completed_onboarding: completed.length,
            not_completed_onboarding: notCompleted.length,
            onboarding_completion_rate: users.length
              ? Math.round((completed.length / users.length) * 100)
              : 0,
            by_provider: byProvider,
            company_verified: users.filter((u) => u.is_company_verified).length,
            verification_rate: users.length
              ? Math.round(
                  (users.filter((u) => u.is_company_verified).length /
                    users.length) *
                    100,
                )
              : 0,
            today: signupsToday,
            this_week: signupsWeek,
            this_month: signupsMonth,
          },
          engagement: {
            dau,
            wau,
            mau,
            dau_mau_ratio: mau ? Math.round((dau / mau) * 100) : 0,
            posts_this_week: postsWeek.count ?? 0,
            posts_this_month: postsMonth.count ?? 0,
            topics_this_week: topicsWeek.count ?? 0,
            topics_this_month: topicsMonth.count ?? 0,
            comments_this_week:
              (feedCommentsWeek.count ?? 0) + (forumCommentsWeek.count ?? 0),
            messages_this_week: messagesWeek.count ?? 0,
            messages_this_month: messagesMonth.count ?? 0,
            active_conversations: activeConversations.count ?? 0,
            active_nooks: activeNooks.count ?? 0,
            mentorship_matches: mentorshipRelationships.count ?? 0,
            identity_reveals: revealAccepted.count ?? 0,
            avg_posts_per_user: activeUsers.length
              ? Math.round(
                  ((postsMonth.count ?? 0) / activeUsers.length) * 10,
                ) / 10
              : 0,
          },
          retention: {
            d7_retention: recentSignups.length
              ? Math.round((d7Retained / recentSignups.length) * 100)
              : 0,
            d30_retention: recentSignups.length
              ? Math.round((d30Retained / recentSignups.length) * 100)
              : 0,
            churned_users: churned,
            total_active: activeUsers.length,
          },
          moderation: {
            reports_total: reports.length,
            reports_this_week: reportsThisWeek,
            reports_by_category: reportsByCategory,
            content_hidden_this_week: hiddenThisWeek,
            avg_resolve_time_hours: Math.round(avgResolveTime * 10) / 10,
            pending_reports: reports.filter(
              (r) => r.status === 'submitted' || r.status === 'under_review',
            ).length,
          },
          charts: {
            signups_30d: signupChart,
          },
        },
      };
    } catch (error: any) {
      logger.error('Admin analytics failed', { error: error.message });
      throw error;
    }
  }

  /**
   * User funnel — signup to engagement milestones
   */
  async getFunnel() {
    try {
      const [
        totalResult,
        otpVerified,
        onboardingCompleted,
        firstPostUsers,
        firstMessageUsers,
        firstMentorship,
      ] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select('id', { count: 'exact', head: true }),
        this.admin
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .not('email', 'is', null),
        this.admin
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('has_completed_onboarding', true),
        this.admin
          .rpc('count_distinct', {
            table_name: 'feed_posts',
            column_name: 'user_id',
          })
          .catch(() => ({ data: null })),
        this.admin
          .rpc('count_distinct', {
            table_name: 'messages',
            column_name: 'sender_id',
          })
          .catch(() => ({ data: null })),
        this.admin
          .rpc('count_distinct', {
            table_name: 'mentorship_relationships',
            column_name: 'mentee_id',
          })
          .catch(() => ({ data: null })),
      ]);

      // Fallback: count distinct manually if RPC not available
      let postUsersCount = firstPostUsers.data;
      let messageUsersCount = firstMessageUsers.data;
      let mentorshipUsersCount = firstMentorship.data;

      if (postUsersCount === null) {
        const { data } = await this.admin.from('feed_posts').select('user_id');
        postUsersCount = new Set((data || []).map((r: any) => r.user_id)).size;
      }
      if (messageUsersCount === null) {
        const { data } = await this.admin.from('messages').select('sender_id');
        messageUsersCount = new Set((data || []).map((r: any) => r.sender_id))
          .size;
      }
      if (mentorshipUsersCount === null) {
        const { data } = await this.admin
          .from('mentorship_relationships')
          .select('mentee_id');
        mentorshipUsersCount = new Set(
          (data || []).map((r: any) => r.mentee_id),
        ).size;
      }

      const total = totalResult.count ?? 0;
      const onboarded = onboardingCompleted.count ?? 0;

      return {
        success: true,
        data: {
          signup: total,
          otp_verified: otpVerified.count ?? 0,
          onboarding_completed: onboarded,
          first_post: postUsersCount,
          first_message: messageUsersCount,
          first_mentorship: mentorshipUsersCount,
          conversion_rates: {
            signup_to_onboarding: total
              ? `${Math.round((onboarded / total) * 100)}%`
              : '0%',
            onboarding_to_first_post: onboarded
              ? `${Math.round((postUsersCount / onboarded) * 100)}%`
              : '0%',
            onboarding_to_first_message: onboarded
              ? `${Math.round((messageUsersCount / onboarded) * 100)}%`
              : '0%',
            signup_to_active: total
              ? `${Math.round((messageUsersCount / total) * 100)}%`
              : '0%',
          },
        },
      };
    } catch (error: any) {
      logger.error('Admin funnel failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Growth charts — 30/60/90 day trends
   */
  async getGrowth(period: '30' | '60' | '90' = '30') {
    try {
      const days = parseInt(period);
      const since = this.daysAgo(days);

      const [signups, posts, topics, messages] = await Promise.all([
        this.admin
          .from('user_profiles')
          .select('created_at')
          .gte('created_at', since),
        this.admin
          .from('feed_posts')
          .select('created_at')
          .gte('created_at', since),
        this.admin
          .from('forum_topics')
          .select('created_at')
          .gte('created_at', since),
        this.admin
          .from('messages')
          .select('created_at')
          .gte('created_at', since),
      ]);

      const halfPoint = this.daysAgo(Math.floor(days / 2));

      const signupsRecent = (signups.data || []).filter(
        (r: any) => r.created_at >= halfPoint,
      ).length;
      const signupsOlder = (signups.data || []).filter(
        (r: any) => r.created_at < halfPoint,
      ).length;
      const postsRecent = (posts.data || []).filter(
        (r: any) => r.created_at >= halfPoint,
      ).length;
      const postsOlder = (posts.data || []).filter(
        (r: any) => r.created_at < halfPoint,
      ).length;

      return {
        success: true,
        data: {
          period: `${days}d`,
          charts: {
            signups: this.buildDailyChart(signups.data || [], days),
            posts: this.buildDailyChart(posts.data || [], days),
            topics: this.buildDailyChart(topics.data || [], days),
            messages: this.buildDailyChart(messages.data || [], days),
          },
          wow_growth: {
            signups: this.calcGrowth(signupsOlder, signupsRecent),
            posts: this.calcGrowth(postsOlder, postsRecent),
          },
        },
      };
    } catch (error: any) {
      logger.error('Admin growth failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Top content — most liked posts, most discussed topics, power users
   */
  async getTopContent() {
    try {
      const weekAgo = this.daysAgo(7);

      const [topPosts, topTopics, topForums, powerUsers] = await Promise.all([
        this.admin
          .from('feed_posts')
          .select(
            'id, content_encrypted, user_id, likes_count, comments_count, created_at, user_profiles!inner(username, avatar)',
          )
          .order('likes_count', { ascending: false })
          .limit(5),
        this.admin
          .from('forum_topics')
          .select(
            'id, title, user_id, comments_count, views_count, created_at, user_profiles!inner(username, avatar)',
          )
          .order('comments_count', { ascending: false })
          .limit(5),
        this.admin
          .from('forums')
          .select('id, name, description')
          .is('deleted_at', null)
          .limit(5),
        this.admin
          .from('feed_posts')
          .select('user_id, user_profiles!inner(username, avatar)')
          .gte('created_at', weekAgo),
      ]);

      // Count posts per user this week
      const userPostCounts: Record<
        string,
        { count: number; username: string; avatar: string }
      > = {};
      (powerUsers.data || []).forEach((p: any) => {
        const profile = Array.isArray(p.user_profiles)
          ? p.user_profiles[0]
          : p.user_profiles;
        if (!userPostCounts[p.user_id]) {
          userPostCounts[p.user_id] = {
            count: 0,
            username: profile?.username || 'Unknown',
            avatar: profile?.avatar || '',
          };
        }
        userPostCounts[p.user_id].count++;
      });
      const topUsers = Object.entries(userPostCounts)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 5)
        .map(([id, data]) => ({ user_id: id, ...data }));

      return {
        success: true,
        data: {
          top_posts: (topPosts.data || []).map((p: any) => {
            const profile = Array.isArray(p.user_profiles)
              ? p.user_profiles[0]
              : p.user_profiles;
            return {
              id: p.id,
              likes: p.likes_count,
              comments: p.comments_count,
              created_at: p.created_at,
              author: { username: profile?.username, avatar: profile?.avatar },
            };
          }),
          top_topics: (topTopics.data || []).map((t: any) => {
            const profile = Array.isArray(t.user_profiles)
              ? t.user_profiles[0]
              : t.user_profiles;
            return {
              id: t.id,
              title: t.title,
              comments: t.comments_count,
              views: t.views_count,
              created_at: t.created_at,
              author: { username: profile?.username, avatar: profile?.avatar },
            };
          }),
          top_forums: (topForums.data || []).map((f: any) => ({
            id: f.id,
            name: f.name,
          })),
          power_users: topUsers,
        },
      };
    } catch (error: any) {
      logger.error('Admin top content failed', { error: error.message });
      throw error;
    }
  }

  private daysAgo(days: number): string {
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  private buildDailyChart(
    rows: Array<{ created_at: string }>,
    days: number,
  ): { labels: string[]; data: number[] } {
    const counts = new Array(days).fill(0);
    const labels: string[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }

    for (const row of rows) {
      const diffDays = Math.floor(
        (now.getTime() - new Date(row.created_at).getTime()) / 86400000,
      );
      if (diffDays >= 0 && diffDays < days) counts[days - 1 - diffDays]++;
    }

    return { labels, data: counts };
  }

  private calcGrowth(older: number, recent: number): string {
    if (older === 0) return recent > 0 ? '+100%' : '0%';
    const pct = Math.round(((recent - older) / older) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }
}
