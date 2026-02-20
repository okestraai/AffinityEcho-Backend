-- CreateTable: feed_reactions (polymorphic reactions for feed content)
CREATE TABLE "feed_reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "content_id" UUID NOT NULL,
    "reaction_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint (one reaction type per user per content)
CREATE UNIQUE INDEX "feed_reactions_user_id_content_type_content_id_reaction_type_key"
  ON "feed_reactions"("user_id", "content_type", "content_id", "reaction_type");

-- CreateIndex: user lookup
CREATE INDEX "feed_reactions_user_id_idx" ON "feed_reactions"("user_id");

-- CreateIndex: content lookup
CREATE INDEX "feed_reactions_content_type_content_id_idx" ON "feed_reactions"("content_type", "content_id");

-- AlterTable: add inspired_count to nook_messages
ALTER TABLE "nook_messages" ADD COLUMN IF NOT EXISTS "inspired_count" INTEGER NOT NULL DEFAULT 0;
