import { Injectable } from '@nestjs/common';
import { getPool } from '../../database/pg-client';

// All reads are admin-only (guarded at the controller) and parameterised by a
// day window. Sessions are windowed on first_seen, events on created_at.
@Injectable()
export class AnalyticsQueryService {
  private pool = getPool();

  private clampDays(days?: number): number {
    const n = Number(days);
    if (!Number.isFinite(n)) return 30;
    return Math.min(365, Math.max(1, Math.floor(n)));
  }

  /** Headline counters for the dashboard cards. */
  async overview(days?: number) {
    const d = this.clampDays(days);
    const [sessions, events, platforms] = await Promise.all([
      this.pool.query(
        `SELECT
           count(*)::int                                              AS total_sessions,
           count(*) FILTER (WHERE user_id IS NOT NULL)::int           AS known_user_sessions,
           count(DISTINCT user_id)::int                               AS unique_users,
           count(*) FILTER (WHERE is_bot)::int                        AS bot_sessions
         FROM "analytics_sessions"
         WHERE first_seen >= now() - ($1::int * interval '1 day')`,
        [d],
      ),
      this.pool.query(
        `SELECT
           count(*) FILTER (WHERE type IN ('page_view','screen_view'))::int AS pageviews,
           count(*)::int                                                    AS total_events
         FROM "analytics_events"
         WHERE created_at >= now() - ($1::int * interval '1 day')`,
        [d],
      ),
      this.pool.query(
        `SELECT platform, count(*)::int AS sessions
         FROM "analytics_sessions"
         WHERE first_seen >= now() - ($1::int * interval '1 day')
         GROUP BY platform ORDER BY sessions DESC`,
        [d],
      ),
    ]);

    const s = sessions.rows[0] || {};
    const e = events.rows[0] || {};
    const totalSessions = s.total_sessions ?? 0;
    const pageviews = e.pageviews ?? 0;
    return {
      rangeDays: d,
      totalSessions,
      pageviews,
      totalEvents: e.total_events ?? 0,
      uniqueUsers: s.unique_users ?? 0,
      knownUserSessions: s.known_user_sessions ?? 0,
      anonymousSessions: totalSessions - (s.known_user_sessions ?? 0),
      botSessions: s.bot_sessions ?? 0,
      avgPageviewsPerSession: totalSessions
        ? +(pageviews / totalSessions).toFixed(2)
        : 0,
      byPlatform: platforms.rows,
    };
  }

  /** Zero-filled daily series of visitors (sessions) + pageviews. */
  async timeseries(days?: number) {
    const d = this.clampDays(days);
    const res = await this.pool.query(
      `WITH days AS (
         SELECT generate_series(
           date_trunc('day', now() - (($1::int - 1) * interval '1 day')),
           date_trunc('day', now()),
           interval '1 day'
         ) AS day
       ),
       s AS (
         SELECT date_trunc('day', first_seen) AS day, count(*)::int AS visitors
         FROM "analytics_sessions"
         WHERE first_seen >= now() - ($1::int * interval '1 day')
         GROUP BY 1
       ),
       e AS (
         SELECT date_trunc('day', created_at) AS day, count(*)::int AS pageviews
         FROM "analytics_events"
         WHERE type IN ('page_view','screen_view')
           AND created_at >= now() - ($1::int * interval '1 day')
         GROUP BY 1
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
              COALESCE(s.visitors, 0)  AS visitors,
              COALESCE(e.pageviews, 0) AS pageviews
       FROM days
       LEFT JOIN s ON s.day = days.day
       LEFT JOIN e ON e.day = days.day
       ORDER BY days.day ASC`,
      [d],
    );
    return res.rows;
  }

  /** Acquisition sources (normalised referrer) + UTM campaigns. */
  async referrers(days?: number) {
    const d = this.clampDays(days);
    const [sources, campaigns] = await Promise.all([
      this.pool.query(
        `SELECT COALESCE(referrer_source, 'direct') AS source, count(*)::int AS sessions
         FROM "analytics_sessions"
         WHERE first_seen >= now() - ($1::int * interval '1 day')
         GROUP BY 1 ORDER BY sessions DESC LIMIT 20`,
        [d],
      ),
      this.pool.query(
        `SELECT utm_source, utm_medium, utm_campaign, count(*)::int AS sessions
         FROM "analytics_sessions"
         WHERE first_seen >= now() - ($1::int * interval '1 day')
           AND utm_campaign IS NOT NULL
         GROUP BY 1,2,3 ORDER BY sessions DESC LIMIT 20`,
        [d],
      ),
    ]);
    return { sources: sources.rows, campaigns: campaigns.rows };
  }

  /** Device type, OS, and browser breakdowns. */
  async devices(days?: number) {
    const d = this.clampDays(days);
    const q = (col: string) =>
      this.pool.query(
        `SELECT COALESCE(${col}, 'unknown') AS name, count(*)::int AS sessions
         FROM "analytics_sessions"
         WHERE first_seen >= now() - ($1::int * interval '1 day')
         GROUP BY 1 ORDER BY sessions DESC LIMIT 15`,
        [d],
      );
    const [deviceType, os, browser] = await Promise.all([
      q('device_type'),
      q('os'),
      q('browser'),
    ]);
    return { deviceType: deviceType.rows, os: os.rows, browser: browser.rows };
  }

  /** Visitor counts by country. */
  async geo(days?: number) {
    const d = this.clampDays(days);
    const res = await this.pool.query(
      `SELECT COALESCE(country, 'unknown') AS country, count(*)::int AS sessions
       FROM "analytics_sessions"
       WHERE first_seen >= now() - ($1::int * interval '1 day')
       GROUP BY 1 ORDER BY sessions DESC LIMIT 30`,
      [d],
    );
    return res.rows;
  }

  /** Top landing pages by session. */
  async landingPages(days?: number) {
    const d = this.clampDays(days);
    const res = await this.pool.query(
      `SELECT COALESCE(landing_path, '(unknown)') AS path, count(*)::int AS sessions
       FROM "analytics_sessions"
       WHERE first_seen >= now() - ($1::int * interval '1 day')
       GROUP BY 1 ORDER BY sessions DESC LIMIT 20`,
      [d],
    );
    return res.rows;
  }
}
