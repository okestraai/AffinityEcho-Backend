// Loose shape of the /analytics/collect payload. Kept as an interface (not a
// validated class) on purpose: a tracking beacon must never be rejected with a
// 400 for a malformed field — the ingest service sanitises defensively instead.
export interface CollectEvent {
  type?: string; // page_view | screen_view | app_open | custom
  path?: string;
  name?: string;
  referrer?: string;
  metadata?: Record<string, unknown>;
}

export interface CollectContext {
  platform?: string; // web | ios | android
  app_version?: string;
  referrer?: string; // document.referrer or inbound deep link
  landing_path?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  // Mobile supplies device fields directly (no UA); web leaves them for
  // server-side user-agent parsing.
  device_type?: string;
  os?: string;
  os_version?: string;
  device_model?: string;
  locale?: string;
  timezone?: string;
}

export interface CollectPayload {
  sid?: string; // client session key
  events?: CollectEvent[];
  context?: CollectContext;
}
