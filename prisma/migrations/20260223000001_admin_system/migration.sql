-- Admin System Migration
-- Adds role-based access control, admin audit logs, content moderation,
-- report timeline, broadcast notifications, and suspension tracking.

-- ─── user_profiles: admin columns ────────────────────────────────────────────

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','moderator','admin','super_admin'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS suspension_expires_at TIMESTAMPTZ;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES user_profiles(id);

-- ─── admin_logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES user_profiles(id),
  admin_username TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  reason        TEXT,
  metadata      JSONB DEFAULT '{}',
  ip_address    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id  ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target    ON admin_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- ─── user_profiles: indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_profiles_role         ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_suspended ON user_profiles(is_suspended);

-- ─── harassment_reports: admin columns ───────────────────────────────────────

ALTER TABLE harassment_reports
  ADD COLUMN IF NOT EXISTS admin_notes       TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to       UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS resolution_action TEXT
    CHECK (resolution_action IN ('warned','suspended','banned','dismissed')),
  ADD COLUMN IF NOT EXISTS resolved_by       UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS reported_user_id  UUID REFERENCES user_profiles(id);

CREATE INDEX IF NOT EXISTS idx_harassment_reports_assigned_to     ON harassment_reports(assigned_to);
CREATE INDEX IF NOT EXISTS idx_harassment_reports_reported_user_id ON harassment_reports(reported_user_id);

-- ─── report_timeline_events ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_timeline_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID NOT NULL REFERENCES harassment_reports(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  performed_by UUID REFERENCES user_profiles(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_timeline_report_id ON report_timeline_events(report_id);

-- ─── content_moderation ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_moderation (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type       TEXT NOT NULL CHECK (content_type IN ('post','comment','nook_message')),
  content_id         UUID NOT NULL,
  moderation_status  TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible','hidden','removed')),
  moderation_reason  TEXT,
  reports_count      INTEGER DEFAULT 0,
  moderated_by       UUID REFERENCES user_profiles(id),
  moderated_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_moderation_type_id ON content_moderation(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_moderation_status  ON content_moderation(moderation_status);

-- ─── admin_notifications ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'system'
    CHECK (type IN ('system','alert','announcement','maintenance')),
  audience         TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all','admins','moderators','users')),
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sent')),
  action_url       TEXT,
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  recipients_count INTEGER DEFAULT 0,
  created_by       UUID NOT NULL REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_status ON admin_notifications(status);

-- ─── Content tables: is_hidden columns ───────────────────────────────────────

ALTER TABLE forum_topics
  ADD COLUMN IF NOT EXISTS is_hidden    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by    UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS hidden_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

ALTER TABLE forum_comments
  ADD COLUMN IF NOT EXISTS is_hidden    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by    UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS hidden_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS is_hidden    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by    UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS hidden_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

ALTER TABLE nook_messages
  ADD COLUMN IF NOT EXISTS is_hidden    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by    UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS hidden_at    TIMESTAMPTZ;

-- ─── forums: admin columns ────────────────────────────────────────────────────

ALTER TABLE forums
  ADD COLUMN IF NOT EXISTS is_locked   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- ─── nooks: admin columns ─────────────────────────────────────────────────────

ALTER TABLE nooks
  ADD COLUMN IF NOT EXISTS is_locked  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope      TEXT DEFAULT 'public'
    CHECK (scope IN ('public','private','company')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
