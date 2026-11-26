export const EVENT_MODES = ['virtual', 'physical', 'hybrid'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const ATTENDANCE = ['in_person', 'online'] as const;
export type Attendance = (typeof ATTENDANCE)[number];

// Hosts may create this many events a day.
export const EVENTS_PER_DAY = 5;

// Edits made within this window reach guests as one message.
export const UPDATE_GROUP_MS = 2 * 60 * 1000;

export const EVENTS_QUEUE = 'events';

// Fields whose change guests are told about.
export const NOTIFIED_FIELDS = [
  'title',
  'starts_at',
  'ends_at',
  'time_zone',
  'mode',
  'venue_name',
  'venue_address',
  'venue_city',
  'map_url',
  'join_url',
] as const;
