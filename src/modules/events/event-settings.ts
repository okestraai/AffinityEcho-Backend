import { BadRequestException } from '@nestjs/common';
import { getPool } from '../../database/pg-client';
import logger from '../../common/utils/logger.util';

// Event rules an admin can change in the console. Ranges keep them safe whatever is typed.
export interface EventSettings {
  events_per_day: number;
  covers_enabled: boolean;
  cover_max_mb: number;
  update_grouping_minutes: number;
}

export interface StorageSettings {
  cover_storage: 'database' | 'bucket';
}

export const EVENT_DEFAULTS: EventSettings = {
  events_per_day: 5,
  covers_enabled: true,
  cover_max_mb: 2,
  update_grouping_minutes: 2,
};

export const STORAGE_DEFAULTS: StorageSettings = { cover_storage: 'database' };

const isInt = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

// Refuses unknown keys and values out of range, so a bad save can't change how events behave.
export function checkEventSettings(
  value: Record<string, unknown>,
): Partial<EventSettings> {
  const out: Partial<EventSettings> = {};
  for (const [key, v] of Object.entries(value ?? {})) {
    switch (key) {
      case 'events_per_day':
        if (!isInt(v, 1, 50))
          throw new BadRequestException(
            'Events per host per day must be a whole number from 1 to 50',
          );
        out.events_per_day = v as number;
        break;
      case 'covers_enabled':
        if (typeof v !== 'boolean')
          throw new BadRequestException('Cover pictures must be on or off');
        out.covers_enabled = v;
        break;
      case 'cover_max_mb':
        if (typeof v !== 'number' || ![0.5, 1, 1.5, 2].includes(v))
          throw new BadRequestException(
            'The cover size limit must be 0.5, 1, 1.5 or 2 MB',
          );
        out.cover_max_mb = v;
        break;
      case 'update_grouping_minutes':
        if (!isInt(v, 0, 30))
          throw new BadRequestException(
            'The grouping window must be a whole number of minutes from 0 to 30',
          );
        out.update_grouping_minutes = v as number;
        break;
      default:
        throw new BadRequestException(`Unknown events setting: ${key}`);
    }
  }
  return out;
}

export function checkStorageSettings(
  value: Record<string, unknown>,
  bucketReady: boolean,
): Partial<StorageSettings> {
  const out: Partial<StorageSettings> = {};
  for (const [key, v] of Object.entries(value ?? {})) {
    if (key !== 'cover_storage')
      throw new BadRequestException(`Unknown storage setting: ${key}`);
    if (v !== 'database' && v !== 'bucket')
      throw new BadRequestException(
        'Cover storage must be "database" or "bucket"',
      );
    if (v === 'bucket' && !bucketReady)
      throw new BadRequestException(
        "The bucket isn't set up on the server yet",
      );
    out.cover_storage = v;
  }
  return out;
}

// Saved values may predate a rule change, so they are checked again and bad ones fall back to the default.
function settle<T extends object>(
  defaults: T,
  saved: unknown,
  check: (v: Record<string, unknown>) => Partial<T>,
): T {
  const result = { ...defaults };
  if (!saved || typeof saved !== 'object') return result;
  for (const [key, v] of Object.entries(saved as Record<string, unknown>)) {
    try {
      Object.assign(result, check({ [key]: v }));
    } catch {
      /* keep the default */
    }
  }
  return result;
}

const CACHE_MS = 30_000;
let cache: {
  at: number;
  events: EventSettings;
  storage: StorageSettings;
} | null = null;
let loading: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    const { rows } = await getPool().query(
      "SELECT key, value FROM system_settings WHERE key IN ('events', 'storage')",
    );
    const by = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    cache = {
      at: Date.now(),
      events: settle(EVENT_DEFAULTS, by.events, checkEventSettings),
      // Storage is checked again when a cover is saved, against the server's bucket.
      storage: settle(STORAGE_DEFAULTS, by.storage, (v) =>
        checkStorageSettings(v, true),
      ),
    };
  } catch (error: any) {
    logger.warn('Could not read event settings; using the last known', {
      error: error?.message,
    });
    cache = cache
      ? { ...cache, at: Date.now() }
      : {
          at: Date.now(),
          events: { ...EVENT_DEFAULTS },
          storage: { ...STORAGE_DEFAULTS },
        };
  } finally {
    loading = null;
  }
}

// Current settings, read again at most every 30 seconds.
export async function eventSettings(): Promise<{
  events: EventSettings;
  storage: StorageSettings;
}> {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    loading = loading ?? refresh();
    await loading;
  }
  return { events: cache!.events, storage: cache!.storage };
}

// For code that can't wait: the last known values, refreshed in the background when old.
export function eventSettingsNow(): {
  events: EventSettings;
  storage: StorageSettings;
} {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    try {
      loading = loading ?? refresh();
    } catch {
      /* defaults below */
    }
  }
  return cache
    ? { events: cache.events, storage: cache.storage }
    : { events: { ...EVENT_DEFAULTS }, storage: { ...STORAGE_DEFAULTS } };
}

// Called after an admin saves, so the change applies at once on this server.
export function clearEventSettingsCache(): void {
  cache = null;
}
