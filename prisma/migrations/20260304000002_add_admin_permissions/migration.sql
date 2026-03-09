-- Migration: Add admin_permissions table for granular RBAC

CREATE TABLE IF NOT EXISTS "admin_permissions" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "admin_id"    UUID        NOT NULL,
  "permissions" TEXT[]      NOT NULL DEFAULT '{}',
  "granted_by"  UUID,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_permissions_admin_id_key" UNIQUE ("admin_id"),
  CONSTRAINT "admin_permissions_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_admin_permissions_admin_id"
  ON "admin_permissions"("admin_id");

-- Enable RLS (only service_role can read/write via admin portal)
ALTER TABLE "admin_permissions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_permissions_service_role" ON "admin_permissions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
