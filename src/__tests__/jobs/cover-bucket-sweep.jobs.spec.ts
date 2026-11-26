const query = jest.fn();
jest.mock('../../database/pg-client', () => ({ getPool: () => ({ query }) }));
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const bucket = { remove: jest.fn().mockResolvedValue(undefined), list: jest.fn() };
jest.mock('../../modules/events/cover-bucket', () => ({ coverBucketFrom: jest.fn(() => bucket) }));

import { CoverBucketSweepJobs } from '../../jobs/cover-bucket-sweep.jobs';
import { coverBucketFrom } from '../../modules/events/cover-bucket';

const now = new Date('2026-11-27T03:30:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
async function* objects(list: { key: string; lastModified: Date }[]) {
  for (const o of list) yield o;
}

describe('cover bucket sweep', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes old pictures no event uses, and keeps used and recent ones', async () => {
    bucket.list.mockReturnValue(
      objects([
        { key: 'event-covers/e1/1.jpg', lastModified: hoursAgo(48) }, // in use
        { key: 'event-covers/e2/2.jpg', lastModified: hoursAgo(48) }, // left behind
        { key: 'event-covers/e3/3.jpg', lastModified: hoursAgo(2) }, // may still be uploading
      ]),
    );
    query.mockResolvedValue({ rows: [{ object_key: 'event-covers/e1/1.jpg' }] });
    const removed = await new CoverBucketSweepJobs({} as any).sweep(now);
    expect(removed).toBe(1);
    expect(bucket.remove).toHaveBeenCalledWith('event-covers/e2/2.jpg');
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(bucket.list).toHaveBeenCalledWith('event-covers/');
  });

  it('does nothing when no bucket is set up', async () => {
    (coverBucketFrom as jest.Mock).mockReturnValueOnce(null);
    expect(await new CoverBucketSweepJobs({} as any).sweep(now)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
