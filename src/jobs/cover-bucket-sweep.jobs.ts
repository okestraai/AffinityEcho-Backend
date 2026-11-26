import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { getPool } from '../database/pg-client';
import logger from '../common/utils/logger.util';
import {
  coverBucketFrom,
  type CoverBucket,
} from '../modules/events/cover-bucket';

// Only pictures older than a day are touched, so an upload in progress is never taken.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;
const MAX_DELETES = 10_000;
// If more than half of the old pictures look unused, this server is probably reading the wrong database.
const SAFE_UNUSED_SHARE = 0.5;
const SAFETY_MIN_OBJECTS = 20;
const MAX_FAILURES_IN_A_ROW = 5;

// Deletes bucket pictures no event uses, such as an upload the server gave up on but the bucket finished.
// It runs only where COVER_BUCKET_SWEEP=on, so a staging or laptop copy holding the keys can't delete anything.
@Injectable()
export class CoverBucketSweepJobs {
  private readonly bucket: CoverBucket | null;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.bucket = coverBucketFrom(config);
    this.enabled = config.get<string>('COVER_BUCKET_SWEEP') === 'on';
  }

  // 03:30 every day.
  @Cron('0 30 3 * * *')
  async sweepDaily() {
    try {
      const removed = await this.sweep(new Date());
      if (removed)
        logger.info('Removed unused cover pictures from the bucket', {
          removed,
        });
    } catch (error) {
      logger.error('Cover bucket sweep failed', { error });
    }
  }

  async sweep(now: Date): Promise<number> {
    if (!this.bucket || !this.enabled) return 0;
    let old = 0;
    const unused: string[] = [];
    let batch: string[] = [];
    const check = async () => {
      if (!batch.length) return;
      const { rows } = await getPool().query(
        'SELECT object_key FROM event_covers WHERE object_key = ANY($1)',
        [batch],
      );
      const used = new Set(
        rows.map((r: { object_key: string }) => r.object_key),
      );
      for (const key of batch)
        if (!used.has(key) && unused.length < MAX_DELETES) unused.push(key);
      batch = [];
    };
    for await (const o of this.bucket.list(this.bucket.prefix)) {
      if (now.getTime() - o.lastModified.getTime() < MIN_AGE_MS) continue;
      old++;
      batch.push(o.key);
      if (batch.length >= BATCH) await check();
    }
    await check();

    if (old >= SAFETY_MIN_OBJECTS && unused.length / old > SAFE_UNUSED_SHARE) {
      logger.error(
        'Cover bucket sweep stopped: most pictures look unused, so nothing was deleted',
        {
          old,
          unused: unused.length,
          prefix: this.bucket.prefix,
        },
      );
      return 0;
    }

    let removed = 0;
    let failedInARow = 0;
    for (const key of unused) {
      try {
        await this.bucket.remove(key);
        removed++;
        failedInARow = 0;
      } catch (error) {
        logger.warn('Could not remove an unused cover', { key, error });
        if (++failedInARow >= MAX_FAILURES_IN_A_ROW) break;
      }
    }
    return removed;
  }
}
