-- When each guest last registered or cancelled, so the host hears about real changes only.
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now();
UPDATE "event_registrations" SET "registered_at" = "created_at" WHERE "created_at" IS NOT NULL;
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(3);
UPDATE "event_registrations" SET "cancelled_at" = "updated_at" WHERE "status" = 'cancelled' AND "cancelled_at" IS NULL;

-- Reminders already sent to this guest for the event's current start time.
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "reminded_day_at" TIMESTAMPTZ(3);
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "reminded_hour_at" TIMESTAMPTZ(3);

-- The last time the host was told about new guests and cancellations.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "host_notified_at" TIMESTAMPTZ(3);
