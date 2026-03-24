-- Migration: Add push_tokens table for Expo push notifications

CREATE TABLE "push_tokens" (
  "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "platform" TEXT NOT NULL CHECK ("platform" IN ('android', 'ios')),
  "device_name" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by user
CREATE INDEX "idx_push_tokens_user_id" ON "push_tokens"("user_id");

-- Enable RLS
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses admin/service-role client)
CREATE POLICY "Service role full access" ON "push_tokens"
  FOR ALL USING (true) WITH CHECK (true);
