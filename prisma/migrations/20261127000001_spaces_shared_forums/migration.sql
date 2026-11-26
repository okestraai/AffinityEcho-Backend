-- Spaces: Shared forums, "Other topics" in every space, the Students space and topic labels.
-- Additive only; safe to run again.

ALTER TABLE "forums"
  ADD COLUMN IF NOT EXISTS "is_shared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_other_topics" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "forums" ADD CONSTRAINT "forums_shared_is_global_chk"
    CHECK (NOT "is_shared" OR ("is_global" AND "company_name" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One "Other topics" forum per space (Global has no company name).
CREATE UNIQUE INDEX IF NOT EXISTS "forums_other_topics_space_key"
  ON "forums" (coalesce("company_name", ''))
  WHERE "is_other_topics" AND "deleted_at" IS NULL;

ALTER TABLE "forum_topics" ADD COLUMN IF NOT EXISTS "label" VARCHAR(40);
CREATE INDEX IF NOT EXISTS "forum_topics_forum_label_idx"
  ON "forum_topics" ("forum_id", lower("label")) WHERE "label" IS NOT NULL;

-- Shared forums: one conversation each, shown in every space.
INSERT INTO "forums" ("name", "description", "icon", "is_global", "is_shared", "company_name", "category", "sort_order", "rules", "moderators")
SELECT v.name, v.description, v.icon, true, true, NULL, 'shared', v.sort_order,
       ARRAY['Be kind and respectful', 'Keep other people''s stories private', 'Support others and contribute constructively'], ARRAY[]::text[]
FROM (VALUES
  ('Mental Health & Wellbeing', 'Stress, anxiety, burnout and looking after yourself', '🧠', 1),
  ('Relationships & Family', 'Partners, family, friends and the people around you', '💞', 2),
  ('Identity & Belonging', 'Who you are and finding where you fit', '🌍', 3),
  ('Money & Life', 'Budgets, debt, saving and big life costs', '💰', 4),
  ('Living Abroad & Immigration', 'Moving countries, visas and settling in', '✈️', 5),
  ('Parenting', 'Raising children while building a life and a career', '🧸', 6),
  ('Faith & Culture', 'Faith, traditions and culture in everyday life', '🕊️', 7)
) AS v(name, description, icon, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "forums" f
  WHERE f."is_shared" AND lower(f."name") = lower(v.name) AND f."deleted_at" IS NULL
);

-- The Students space.
INSERT INTO "forums" ("name", "description", "icon", "is_global", "company_name", "category", "sort_order", "rules", "moderators")
SELECT v.name, v.description, v.icon, false, 'Students', 'students', v.sort_order,
       ARRAY['Be kind and respectful', 'Keep other people''s stories private', 'Support others and contribute constructively'], ARRAY[]::text[]
FROM (VALUES
  ('Exam Stress & Burnout', 'Exams, deadlines and keeping going', '📚', 1),
  ('Campus Life', 'Classes, housing, clubs and everyday student life', '🏫', 2),
  ('Student Money & Finance', 'Fees, loans, part-time work and budgets', '💳', 3),
  ('International Students', 'Studying away from home', '🌐', 4),
  ('Internships & First Jobs', 'Applications, interviews and starting work', '💼', 5),
  ('Dating & Relationships at Uni', 'Relationships and friendships while studying', '💬', 6),
  ('What Comes After Graduation', 'Next steps after you finish', '🎓', 7)
) AS v(name, description, icon, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "forums" f
  WHERE f."company_name" = 'Students' AND lower(f."name") = lower(v.name) AND f."deleted_at" IS NULL
);

-- "Other topics" in Global, the Students space and every company space.
INSERT INTO "forums" ("name", "description", "icon", "is_global", "is_other_topics", "company_name", "category", "sort_order", "rules", "moderators")
SELECT 'Other topics', 'Anything that doesn''t fit another forum', '💭', s.company_name IS NULL, true, s.company_name, 'other', 1000,
       ARRAY['Be kind and respectful', 'Keep other people''s stories private', 'Support others and contribute constructively'], ARRAY[]::text[]
FROM (
  SELECT NULL::text AS company_name
  UNION SELECT 'Students'
  UNION SELECT DISTINCT "company_name" FROM "forums"
   WHERE NOT "is_global" AND "company_name" IS NOT NULL AND "deleted_at" IS NULL
) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM "forums" f
  WHERE f."is_other_topics" AND f."deleted_at" IS NULL
    AND coalesce(f."company_name", '') = coalesce(s.company_name, '')
);

-- Topics in Global and Shared forums are open to everyone, whatever company an older app sent with them.
UPDATE "forum_topics" t
   SET "company_name" = NULL, "scope" = 'global'
  FROM "forums" f
 WHERE f."id" = t."forum_id"
   AND f."is_global"
   AND (t."company_name" IS NOT NULL OR t."scope" <> 'global');
