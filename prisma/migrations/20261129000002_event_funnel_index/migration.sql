-- A member's onboarding after an event sign-up is counted once, even if onboarding is sent twice at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_event_onboarding_once"
  ON "analytics_events" ("user_id")
  WHERE "session_key" = 'server' AND "name" = 'event_onboarding_completed';
