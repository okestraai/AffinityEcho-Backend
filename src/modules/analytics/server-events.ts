import { getPool } from '../../database/pg-client';
import logger from '../../common/utils/logger.util';

// Product steps the server knows for certain, kept next to the visitor events.
export const SERVER_SESSION = 'server';

export type EventFunnelStep =
  | 'event_otp_requested'
  | 'event_otp_verified'
  | 'event_registered'
  | 'event_onboarding_completed'
  | 'event_created'
  | 'event_updated_notified';

// Never stores emails or names. Fire and forget: tracking can't fail a request.
export function trackServerEvent(
  name: EventFunnelStep,
  userId: string | null,
  metadata: Record<string, string | number | boolean | null> = {},
): void {
  record(
    name,
    `INSERT INTO "analytics_events" (session_key, user_id, type, name, platform, metadata)
     VALUES ($1, $2, 'custom', $3, 'server', $4::jsonb)`,
    [SERVER_SESSION, userId, name, JSON.stringify(metadata)],
  );
}

function record(name: string, sql: string, params: unknown[]): void {
  try {
    Promise.resolve(getPool().query(sql, params)).catch((error) =>
      logger.warn('Could not record a funnel step', {
        name,
        error: error?.message,
      }),
    );
  } catch (error: any) {
    logger.warn('Could not record a funnel step', {
      name,
      error: error?.message,
    });
  }
}

// Counted once per member, and only for members who first came through an event link.
export function trackEventOnboarding(userId: string): void {
  record(
    'event_onboarding_completed',
    `INSERT INTO "analytics_events" (session_key, user_id, type, name, platform, metadata)
     SELECT $1, u.id, 'custom', 'event_onboarding_completed', 'server',
            jsonb_build_object('daysSinceSignup', floor(extract(epoch FROM now() - u.created_at) / 86400)::int)
       FROM user_profiles u
      WHERE u.id = $2
        AND EXISTS (SELECT 1 FROM event_registrations r WHERE r.user_id = u.id AND r.source = 'link')
        AND NOT EXISTS (SELECT 1 FROM "analytics_events" a
                         WHERE a.session_key = $1 AND a.platform = 'server'
                           AND a.user_id = u.id AND a.name = 'event_onboarding_completed')
     ON CONFLICT DO NOTHING`,
    [SERVER_SESSION, userId],
  );
}
