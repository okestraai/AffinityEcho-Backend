-- Add company_id to forums table
-- Was present in schema.prisma but missing from the DB (no companies table to reference)

ALTER TABLE forums
  ADD COLUMN IF NOT EXISTS company_id UUID;

CREATE INDEX IF NOT EXISTS idx_forums_company_id ON forums(company_id);
