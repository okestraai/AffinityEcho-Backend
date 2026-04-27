-- Health checks table for module monitoring
CREATE TABLE IF NOT EXISTS health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('up', 'down')),
  latency_ms INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying recent checks by module
CREATE INDEX idx_health_checks_module_checked ON health_checks (module, checked_at DESC);

-- Index for cleanup of old records
CREATE INDEX idx_health_checks_checked_at ON health_checks (checked_at);
