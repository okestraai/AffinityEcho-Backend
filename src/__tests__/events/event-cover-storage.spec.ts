import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from '../../modules/events/events.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { getPool } from '../../database/pg-client';
import { eventSettings, eventSettingsNow } from '../../modules/events/event-settings';
import { coverBucketFrom } from '../../modules/events/cover-bucket';
import {
  createMockConfigService,
  createMockQueryChain,
  createMockSupabaseClient,
} from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../database/pg-client', () => ({ getPool: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('qrcode', () => ({ toBuffer: jest.fn() }));
jest.mock('../../modules/events/event-settings', () => ({
  eventSettings: jest.fn(),
  eventSettingsNow: jest.fn(),
}));
jest.mock('../../modules/events/cover-bucket', () => ({ coverBucketFrom: jest.fn() }));

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]),
  Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]),
]);
const settings = (events: Record<string, unknown> = {}, storage = 'database') => {
  const value = {
    events: { events_per_day: 5, covers_enabled: true, cover_max_mb: 2, update_grouping_minutes: 2, ...events },
    storage: { cover_storage: storage },
  };
  (eventSettings as jest.Mock).mockResolvedValue(value);
  (eventSettingsNow as jest.Mock).mockReturnValue(value);
};

describe('cover storage', () => {
  let query: jest.Mock;
  let bucket: { name: string; put: jest.Mock; get: jest.Mock; remove: jest.Mock };
  const event = { id: 'e1', slug: 'talk-abcdef', host_id: 'host', status: 'published', cover_updated_at: '2026-11-26T10:00:00Z' };

  const make = (withBucket: boolean) => {
    const client = createMockSupabaseClient().client;
    client.from.mockReturnValue(createMockQueryChain({ data: event, error: null }));
    (supabaseAdmin as jest.Mock).mockReturnValue(client);
    (coverBucketFrom as jest.Mock).mockReturnValue(withBucket ? bucket : null);
    return new EventsService(createMockConfigService() as any, {} as any, {} as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    query = jest.fn().mockResolvedValue({ rows: [] });
    (getPool as jest.Mock).mockReturnValue({ query });
    bucket = { name: 'covers', put: jest.fn(), get: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };
    settings();
  });

  it('keeps the picture in the database by default', async () => {
    await make(true).setCover('host', 'e1', jpeg);
    expect(bucket.put).not.toHaveBeenCalled();
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO event_covers'));
    expect(insert[1][2]).toBeInstanceOf(Buffer);
    expect(insert[1][4]).toBe('database');
  });

  it('puts the picture in the bucket when an admin chose it, and the row holds only the key', async () => {
    settings({}, 'bucket');
    await make(true).setCover('host', 'e1', jpeg);
    expect(bucket.put).toHaveBeenCalledWith(expect.stringMatching(/^event-covers\/e1\/\d+\.jpg$/), expect.any(Buffer), 'image/jpeg');
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO event_covers'));
    expect(insert[1][2]).toBeNull();
    expect(insert[1][4]).toBe('bucket');
  });

  it('falls back to the database if the bucket was chosen but is not set up', async () => {
    settings({}, 'bucket');
    await make(false).setCover('host', 'e1', jpeg);
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO event_covers'));
    expect(insert[1][4]).toBe('database');
  });

  it('removes the old bucket picture after a replacement, and the new one if saving fails', async () => {
    settings({}, 'bucket');
    query.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT') ? { rows: [{ mime: 'image/jpeg', storage: 'bucket', object_key: 'event-covers/e1/1.jpg' }] } : { rows: [] },
    );
    await make(true).setCover('host', 'e1', jpeg);
    expect(bucket.remove).toHaveBeenCalledWith('event-covers/e1/1.jpg');

    bucket.remove.mockClear();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO event_covers')) throw new Error('db down');
      return { rows: [] };
    });
    await expect(make(true).setCover('host', 'e1', jpeg)).rejects.toThrow('Could not save the picture');
    expect(bucket.remove).toHaveBeenCalledWith(bucket.put.mock.calls[1][0]);
  });

  it('serves a bucket picture through the same address', async () => {
    query.mockResolvedValue({ rows: [{ mime: 'image/jpeg', storage: 'bucket', object_key: 'event-covers/e1/1.jpg', data: null }] });
    bucket.get.mockResolvedValue(Buffer.from('PIXELS'));
    const file = await make(true).coverFile('talk-abcdef');
    expect(bucket.get).toHaveBeenCalledWith('event-covers/e1/1.jpg');
    expect(file.data.toString()).toBe('PIXELS');
  });

  it('turning covers off refuses uploads and hides pictures', async () => {
    settings({ covers_enabled: false });
    const service = make(true);
    await expect(service.setCover('host', 'e1', jpeg)).rejects.toThrow(ForbiddenException);
    await expect(service.coverFile('talk-abcdef')).rejects.toThrow(NotFoundException);
  });

  it('applies the admin size limit', async () => {
    settings({ cover_max_mb: 0.5 });
    const big = Buffer.concat([jpeg.subarray(0, 4), Buffer.alloc(600 * 1024, 0x11)]);
    await expect(make(true).setCover('host', 'e1', big)).rejects.toThrow('0.5 MB or smaller');
  });
});
