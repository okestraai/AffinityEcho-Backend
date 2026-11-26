const query = jest.fn();
jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query }) }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const bucket = { prefix: 'event-covers/', remove: jest.fn().mockResolvedValue(undefined), list: jest.fn() };
jest.mock('../../modules/events/cover-bucket', () => ({ coverBucketFrom: jest.fn(() => bucket) }));

import { CoverBucketSweepJobs } from '../../jobs/cover-bucket-sweep.jobs';
import { coverBucketFrom } from '../../modules/events/cover-bucket';

const now = new Date('2026-11-27T03:30:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
async function* objects(list: { key: string; lastModified: Date }[]) {
  for (const o of list) yield o;
}

// The sweep runs only where the server says this environment owns the bucket.
const on = { get: (k: string) => (k === 'COVER_BUCKET_SWEEP' ? 'on' : undefined) } as any;
const used = (keys: string[]) =>
  query.mockImplementation(async (_sql: string, [batch]: [string[]]) => ({
    rows: batch.filter((k) => keys.includes(k)).map((k) => ({ object_key: k })),
  }));
const old = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ key: `event-covers/e${from + i}/1.jpg`, lastModified: hoursAgo(48) }));

describe('cover bucket sweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bucket.remove.mockReset().mockResolvedValue(undefined);
  });

  it('removes old pictures no event uses, and keeps used and recent ones', async () => {
    bucket.list.mockReturnValue(
      objects([
        { key: 'event-covers/e1/1.jpg', lastModified: hoursAgo(48) }, // in use
        { key: 'event-covers/e2/2.jpg', lastModified: hoursAgo(48) }, // left behind
        { key: 'event-covers/e3/3.jpg', lastModified: hoursAgo(2) }, // may still be uploading
      ]),
    );
    query.mockResolvedValue({ rows: [{ object_key: 'event-covers/e1/1.jpg' }] });
    const removed = await new CoverBucketSweepJobs(on).sweep(now);
    expect(removed).toBe(1);
    expect(bucket.remove).toHaveBeenCalledWith('event-covers/e2/2.jpg');
    expect(bucket.remove).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no bucket is set up', async () => {
    (coverBucketFrom as jest.Mock).mockReturnValueOnce(null);
    expect(await new CoverBucketSweepJobs(on).sweep(now)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('never runs unless this server is told it owns the bucket', async () => {
    bucket.list.mockReturnValue(objects(old(3)));
    used([]);
    expect(await new CoverBucketSweepJobs({ get: () => undefined } as any).sweep(now)).toBe(0);
    expect(bucket.list).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('deletes nothing when most pictures look unused, which means it is looking at the wrong database', async () => {
    const list = old(40);
    bucket.list.mockReturnValue(objects(list));
    used(list.slice(0, 10).map((o) => o.key)); // 30 of 40 look unused
    expect(await new CoverBucketSweepJobs(on).sweep(now)).toBe(0);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('keeps going past a failed delete, and stops after several in a row', async () => {
    const list = old(30);
    bucket.list.mockReturnValue(objects(list));
    used(list.slice(0, 27).map((o) => o.key)); // 3 unused
    bucket.remove.mockRejectedValueOnce(new Error('timeout'));
    expect(await new CoverBucketSweepJobs(on).sweep(now)).toBe(2);
    expect(bucket.remove).toHaveBeenCalledTimes(3);
  });

  it('lists only this environment\'s prefix', async () => {
    bucket.list.mockReturnValue(objects([]));
    await new CoverBucketSweepJobs(on).sweep(now);
    expect(bucket.list).toHaveBeenCalledWith('event-covers/');
  });
});
