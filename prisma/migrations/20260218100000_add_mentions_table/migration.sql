-- CreateTable
CREATE TABLE IF NOT EXISTS "mentions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "mentioner_id" UUID NOT NULL,
  "mentioned_user_id" UUID NOT NULL,
  "content_type" VARCHAR(20) NOT NULL,
  "content_id" UUID NOT NULL,
  "context_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "mentions_unique" ON "mentions"("mentioner_id","mentioned_user_id","content_type","content_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_mentions_mentioned_user" ON "mentions"("mentioned_user_id","created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_mentions_content" ON "mentions"("content_type","content_id");

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioner_id_fkey" FOREIGN KEY ("mentioner_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "mentions" ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own mentions" ON "mentions"
  FOR SELECT USING (
    auth.uid() = mentioned_user_id OR auth.uid() = mentioner_id
  );

CREATE POLICY "Service role full access on mentions" ON "mentions"
  FOR ALL USING (auth.role() = 'service_role');
