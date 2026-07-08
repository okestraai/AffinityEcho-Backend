import { Injectable } from '@nestjs/common';
import { getPool } from '../../database/pg-client';
import logger from '../../common/utils/logger.util';
import { CollectPayload } from './dto/collect.dto';
import {
  clientIp,
  hashIp,
  lookupGeo,
  parseUserAgent,
  referrerSource,
} from './analytics-context.util';

const ALLOWED_TYPES = new Set([
  'page_view',
  'screen_view',
  'app_open',
  'custom',
]);
const ALLOWED_PLATFORMS = new Set(['web', 'ios', 'android']);
// Own hosts — a referrer from these counts as "internal", not acquisition.
const SELF_HOSTS = (
  process.env.ANALYTICS_SELF_HOSTS || 'app.affinityecho.com,affinityecho.com'
)
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function s(v: unknown, max = 512): string | null {
  // Only accept scalars — anything else (objects/arrays/functions) → null.
  let str: string;
  if (typeof v === 'string') str = v;
  else if (typeof v === 'number' || typeof v === 'boolean') str = String(v);
  else return null;
  str = str.trim();
  return str ? str.slice(0, max) : null;
}

// Path fields must never carry the query string — it can contain reset/OTP/
// invite tokens or other secrets. Store the path portion only (defence in depth;
// the web client already strips it).
function pathOnly(v: unknown, max = 512): string | null {
  const str = s(v, max);
  return str ? str.split(/[?#]/)[0] : null;
}

// Store metadata only when it serialises to valid, bounded JSON. Slicing the
// serialised string could cut mid-token and make the ::jsonb cast throw, which
// would abort the whole event insert — so we drop oversized metadata instead.
function safeMetadata(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  try {
    const json = JSON.stringify(v);
    return json && json.length <= 8000 ? json : null;
  } catch {
    return null;
  }
}

@Injectable()
export class AnalyticsIngestService {
  private pool = getPool();

  /**
   * Record a batch of client events + session context. Best-effort and fully
   * defensive: any failure is logged and swallowed so tracking can never break
   * a user-facing request.
   */
  async record(
    payload: CollectPayload,
    req: any,
    userId: string | null,
  ): Promise<void> {
    try {
      const sessionKey = s(payload?.sid, 128);
      if (!sessionKey) return; // no session id → nothing to correlate; drop quietly

      const ctx = payload?.context || {};
      const rawEvents = Array.isArray(payload?.events)
        ? payload.events.slice(0, 50)
        : [];

      const platform = ALLOWED_PLATFORMS.has(String(ctx.platform))
        ? String(ctx.platform)
        : 'web';

      // Device/OS/browser: web → parse the request UA; mobile → trust client fields.
      const ua = req?.headers?.['user-agent'] as string | undefined;
      const uaInfo = parseUserAgent(ua);
      const isMobile = platform === 'ios' || platform === 'android';

      const deviceType = isMobile
        ? s(ctx.device_type) ||
          (platform === 'ios' || platform === 'android' ? 'mobile' : null)
        : uaInfo.device_type;
      const os = isMobile ? s(ctx.os) : uaInfo.os;
      const osVersion = isMobile ? s(ctx.os_version) : uaInfo.os_version;
      const browser = isMobile ? null : uaInfo.browser;
      const deviceModel = isMobile ? s(ctx.device_model) : uaInfo.device_model;

      const ip = clientIp(req);
      const geo = lookupGeo(ip);
      const ipHash = hashIp(ip);

      const ref = referrerSource(
        s(ctx.referrer, 1024) || undefined,
        SELF_HOSTS,
      );
      const utm = ctx.utm || {};

      const eventCount = rawEvents.length || 1;

      // ── Upsert the session. First-touch attribution (landing/referrer/utm/geo/
      // device) is written on INSERT only; on conflict we keep the original and
      // just bump last_seen / event_count and back-fill user_id once known.
      const sessionSql = `
        INSERT INTO "analytics_sessions" (
          session_key, user_id, platform, device_type, os, os_version, browser, device_model,
          app_version, country, region, city, referrer_source, referrer_url,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          landing_path, locale, timezone, ip_hash, is_bot, event_count, first_seen, last_seen
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now(), now()
        )
        ON CONFLICT (session_key) DO UPDATE SET
          last_seen = now(),
          event_count = "analytics_sessions".event_count + EXCLUDED.event_count,
          user_id = COALESCE("analytics_sessions".user_id, EXCLUDED.user_id)`;

      await this.pool.query(sessionSql, [
        sessionKey,
        userId,
        platform,
        deviceType,
        os,
        osVersion,
        browser,
        deviceModel,
        s(ctx.app_version, 32),
        geo.country,
        geo.region,
        geo.city,
        ref.referrer_source,
        ref.referrer_url,
        s(utm.source, 128),
        s(utm.medium, 128),
        s(utm.campaign, 128),
        s(utm.term, 128),
        s(utm.content, 128),
        pathOnly(ctx.landing_path, 512),
        s(ctx.locale, 32),
        s(ctx.timezone, 64),
        ipHash,
        uaInfo.is_bot,
        eventCount,
      ]);

      if (rawEvents.length === 0) return;

      // ── Bulk-insert events (created_at defaults to now() server-side).
      const cols = [
        'session_key',
        'user_id',
        'type',
        'path',
        'name',
        'referrer',
        'platform',
        'metadata',
      ];
      const values: any[] = [];
      const rows: string[] = [];
      let p = 0;
      for (const ev of rawEvents) {
        const type = ALLOWED_TYPES.has(String(ev?.type))
          ? String(ev.type)
          : 'custom';
        const metadata = safeMetadata(ev?.metadata);
        rows.push(
          `($${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p}::jsonb)`,
        );
        values.push(
          sessionKey,
          userId,
          type,
          pathOnly(ev?.path),
          s(ev?.name, 128),
          s(ev?.referrer, 1024),
          platform,
          metadata,
        );
      }
      const eventsSql = `INSERT INTO "analytics_events" (${cols.join(', ')}) VALUES ${rows.join(', ')}`;
      await this.pool.query(eventsSql, values);
    } catch (err: any) {
      // Never propagate — analytics must not affect the client request.
      logger.warn(`[analytics] ingest failed: ${err?.message}`);
    }
  }
}
