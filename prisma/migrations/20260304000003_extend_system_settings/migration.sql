-- Migration: Extend system_settings with new frontend-required fields
-- Uses JSONB || operator to merge new keys without overwriting existing values

UPDATE "system_settings"
  SET "value" = "value" || '{"support_email":"support@affinityecho.com"}'::jsonb
  WHERE "key" = 'general';

UPDATE "system_settings"
  SET "value" = "value" || '{"ip_whitelist_enabled":false,"allowlist_ips":[]}'::jsonb
  WHERE "key" = 'security';

UPDATE "system_settings"
  SET "value" = "value" || '{
    "email_on_new_report":true,
    "email_on_new_user":false,
    "email_on_flagged_content":true,
    "push_on_new_report":true,
    "push_on_new_user":false,
    "push_on_flagged_content":true,
    "report_alert_threshold":5
  }'::jsonb
  WHERE "key" = 'notifications';

UPDATE "system_settings"
  SET "value" = "value" || '{
    "spam_filter_strength":"medium",
    "content_retention_days":365,
    "report_auto_resolve_days":30,
    "require_review_for_new_users":false
  }'::jsonb
  WHERE "key" = 'moderation';
