const query = jest.fn();
jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query }) }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import {
  EVENT_DEFAULTS,
  checkEventSettings,
  checkStorageSettings,
  clearEventSettingsCache,
  eventSettings,
} from '../../modules/events/event-settings';
import { coverBucketStatus } from '../../modules/events/cover-bucket';

describe('event settings from the admin console', () => {
  beforeEach(() => {
    clearEventSettingsCache();
    query.mockReset();
  });

  it('accepts values in range', () => {
    expect(
      checkEventSettings({ events_per_day: 10, covers_enabled: false, cover_max_mb: 1.5, update_grouping_minutes: 0 }),
    ).toEqual({ events_per_day: 10, covers_enabled: false, cover_max_mb: 1.5, update_grouping_minutes: 0 });
  });

  it.each([
    [{ events_per_day: 0 }, '1 to 50'],
    [{ events_per_day: 51 }, '1 to 50'],
    [{ events_per_day: 2.5 }, '1 to 50'],
    [{ events_per_day: '5' }, '1 to 50'],
    [{ cover_max_mb: 3 }, '0.5, 1, 1.5 or 2'],
    [{ covers_enabled: 'yes' }, 'on or off'],
    [{ update_grouping_minutes: 31 }, '0 to 30'],
    [{ max_cover_count: 3 }, 'Unknown events setting'],
  ])('refuses %j', (value, message) => {
    expect(() => checkEventSettings(value as any)).toThrow(message);
  });

  it('only lets admins pick the bucket when the server has one', () => {
    expect(checkStorageSettings({ cover_storage: 'bucket' }, true)).toEqual({ cover_storage: 'bucket' });
    expect(() => checkStorageSettings({ cover_storage: 'bucket' }, false)).toThrow("isn't set up");
    expect(() => checkStorageSettings({ cover_storage: 's3' }, true)).toThrow('"database" or "bucket"');
    expect(() => checkStorageSettings({ bucket_key: 'x' }, true)).toThrow('Unknown storage setting');
  });

  it('uses saved values, and falls back to the default for a bad saved value', async () => {
    query.mockResolvedValue({
      rows: [{ key: 'events', value: { events_per_day: 9, cover_max_mb: 99, covers_enabled: false } }],
    });
    const { events, storage } = await eventSettings();
    expect(events.events_per_day).toBe(9);
    expect(events.covers_enabled).toBe(false);
    expect(events.cover_max_mb).toBe(EVENT_DEFAULTS.cover_max_mb);
    expect(storage.cover_storage).toBe('database');
  });

  it('reads the database at most every 30 seconds, and again right after a save', async () => {
    query.mockResolvedValue({ rows: [] });
    await eventSettings();
    await eventSettings();
    expect(query).toHaveBeenCalledTimes(1);
    clearEventSettingsCache();
    await eventSettings();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps working on defaults if the settings table cannot be read', async () => {
    query.mockRejectedValue(new Error('down'));
    expect((await eventSettings()).events).toEqual(EVENT_DEFAULTS);
  });

  it('tells the admin console whether a bucket is set up, never the keys', () => {
    const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as any;
    const all = {
      COVER_BUCKET_NAME: 'covers',
      COVER_BUCKET_ENDPOINT: 'https://r2.example.com',
      COVER_BUCKET_ACCESS_KEY_ID: 'id',
      COVER_BUCKET_SECRET_ACCESS_KEY: 'secret',
    };
    expect(coverBucketStatus(config(all))).toEqual({ bucketReady: true, bucketName: 'covers' });
    expect(JSON.stringify(coverBucketStatus(config(all)))).not.toContain('secret');
    expect(coverBucketStatus(config({ ...all, COVER_BUCKET_SECRET_ACCESS_KEY: '' }))).toEqual({
      bucketReady: false,
      bucketName: null,
    });
  });
});
