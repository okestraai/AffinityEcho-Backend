-- Global onboarding: country, student details, typed-company key and a global company list.
-- Additive only; safe to run again.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "country_code" CHAR(2),
  ADD COLUMN IF NOT EXISTS "country_prompt_dismissed_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "is_student" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "school_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "school_alumni_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "expected_grad_year" SMALLINT,
  ADD COLUMN IF NOT EXISTS "show_school" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "student_status_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "company_key" TEXT;

CREATE INDEX IF NOT EXISTS "user_profiles_country_code_idx" ON "user_profiles" ("country_code");
CREATE INDEX IF NOT EXISTS "user_profiles_is_student_idx" ON "user_profiles" ("is_student") WHERE "is_student";
CREATE INDEX IF NOT EXISTS "user_profiles_company_key_idx" ON "user_profiles" ("company_key") WHERE "company_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "companies" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"       VARCHAR(120) NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "companies_name_lower_key" ON "companies" (lower("name"));

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON "companies" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- The names the apps listed before this change.
INSERT INTO "companies" ("name") VALUES
  ('Google'), ('Microsoft'), ('Apple'), ('Amazon'), ('Meta'), ('Netflix'), ('Tesla'),
  ('Goldman Sachs'), ('JPMorgan Chase'), ('Bank of America'), ('Wells Fargo'),
  ('McKinsey & Company'), ('Boston Consulting Group'), ('Deloitte'), ('PwC'),
  ('Johnson & Johnson'), ('Pfizer'), ('Merck'), ('Abbott'), ('Bristol Myers Squibb'),
  ('Memorial University of Newfoundland'), ('Staples Canada')
ON CONFLICT DO NOTHING;
