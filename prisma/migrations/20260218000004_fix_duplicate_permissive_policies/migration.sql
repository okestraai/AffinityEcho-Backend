-- Migration: Fix duplicate permissive policies
--
-- 1. mentorship_direct_requests: Drop the duplicate mentorship_requests_* policies
--    that were incorrectly created on this table (they duplicate the
--    mentorship_direct_requests_* policies).
--
-- 2. user_profiles: Merge user_profiles_select_own + user_profiles_select_others
--    into a single SELECT policy to avoid evaluating two policies per query.

-- ============================================================
-- 1. Drop duplicate policies on mentorship_direct_requests
-- ============================================================
DROP POLICY IF EXISTS "mentorship_requests_select" ON "mentorship_direct_requests";
DROP POLICY IF EXISTS "mentorship_requests_insert" ON "mentorship_direct_requests";
DROP POLICY IF EXISTS "mentorship_requests_update" ON "mentorship_direct_requests";

-- ============================================================
-- 2. Merge user_profiles SELECT policies into one
-- ============================================================
DROP POLICY IF EXISTS "user_profiles_select_own" ON "user_profiles";
DROP POLICY IF EXISTS "user_profiles_select_others" ON "user_profiles";

CREATE POLICY "user_profiles_select"
  ON "user_profiles" FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR (is_deleted = false AND is_deactivated = false)
  );
