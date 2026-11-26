-- Optional cover picture for an event, kept in the database (no outside file storage).
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cover_updated_at" TIMESTAMPTZ(3);

CREATE TABLE IF NOT EXISTS "event_covers" (
  "event_id"   UUID NOT NULL,
  "mime"       VARCHAR(20) NOT NULL,
  "data"       BYTEA NOT NULL,
  "size"       INTEGER NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "event_covers_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "event_covers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "event_covers_mime_check" CHECK ("mime" IN ('image/jpeg', 'image/png')),
  CONSTRAINT "event_covers_size_check" CHECK ("size" > 0 AND "size" <= 2097152)
);

ALTER TABLE "event_covers" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_covers' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON "event_covers" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
