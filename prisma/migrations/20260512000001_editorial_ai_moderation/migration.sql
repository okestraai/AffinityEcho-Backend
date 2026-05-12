-- Editorial AI Moderation: schema additions
-- Adds moderation columns to tables missing them, extends content_moderation for AI audit,
-- and creates moderation_review_queue + moderation_disagreements tables.

-- 1. feed_comments: add moderation columns (previously missing)
ALTER TABLE "feed_comments"
  ADD COLUMN IF NOT EXISTS "is_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hidden_by" UUID,
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;

-- 2. nooks: add missing moderation columns (had is_hidden but not hidden_by/hidden_at/hidden_reason)
ALTER TABLE "nooks"
  ADD COLUMN IF NOT EXISTS "hidden_by" UUID,
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;

-- 3. nook_messages: add missing hidden_reason
ALTER TABLE "nook_messages"
  ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;

-- 4. referral_posts: add moderation columns
ALTER TABLE "referral_posts"
  ADD COLUMN IF NOT EXISTS "is_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hidden_by" UUID,
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;

-- 5. referral_comments: add moderation columns
ALTER TABLE "referral_comments"
  ADD COLUMN IF NOT EXISTS "is_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hidden_by" UUID,
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;

-- 6. content_moderation: extend for AI audit trail
--    Change moderated_by from UUID to TEXT to support 'ai:editorial' and 'human:<uuid>'
ALTER TABLE "content_moderation"
  ALTER COLUMN "moderated_by" TYPE TEXT;

ALTER TABLE "content_moderation"
  ADD COLUMN IF NOT EXISTS "model_version" TEXT,
  ADD COLUMN IF NOT EXISTS "policy_version" TEXT,
  ADD COLUMN IF NOT EXISTS "raw_response" JSONB,
  ADD COLUMN IF NOT EXISTS "ai_confidence" DOUBLE PRECISION;

-- Add index on moderated_by for filtering AI vs human decisions
CREATE INDEX IF NOT EXISTS "content_moderation_moderated_by_idx"
  ON "content_moderation" ("moderated_by");

-- 7. moderation_review_queue: items pending human review
CREATE TABLE IF NOT EXISTS "moderation_review_queue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_type" TEXT NOT NULL,
  "content_id" UUID NOT NULL,
  "priority" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "ai_verdict" JSONB NOT NULL,
  "ai_payload" JSONB NOT NULL,
  "current_state" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claimed_by" UUID,
  "resolved_by" UUID,
  "resolution" TEXT,
  "resolution_reason" TEXT,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "moderation_review_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderation_review_queue_content_type_content_id_key"
  ON "moderation_review_queue" ("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "moderation_review_queue_status_priority_created_at_idx"
  ON "moderation_review_queue" ("status", "priority", "created_at");

-- 8. moderation_disagreements: log when humans reverse AI decisions (for prompt tuning)
CREATE TABLE IF NOT EXISTS "moderation_disagreements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_type" TEXT NOT NULL,
  "content_id" UUID NOT NULL,
  "ai_verdict" JSONB NOT NULL,
  "human_resolution" TEXT NOT NULL,
  "human_reason" TEXT,
  "resolved_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "moderation_disagreements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "moderation_disagreements_created_at_idx"
  ON "moderation_disagreements" ("created_at");

-- Drop the old FK constraint on content_moderation.moderated_by (was UUID → user_profiles)
-- This is safe because the relation was never used in application code.
ALTER TABLE "content_moderation"
  DROP CONSTRAINT IF EXISTS "content_moderation_moderated_by_fkey";
