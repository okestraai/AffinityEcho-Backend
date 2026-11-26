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

// Deletes bucket pictures no event uses, such as an upload the server gave up on but the bucket finished.
@Injectable()
export class CoverBucketSweepJobs {
  private readonly bucket: CoverBucket | null;

  constructor(config: ConfigService) {
    this.bucket = coverBucketFrom(config);
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
    if (!this.bucket) return 0;
    let removed = 0;
    let batch: string[] = [];
    const flush = async () => {
      if (!batch.length) return;
      const { rows } = await getPool().query(
        'SELECT object_key FROM event_covers WHERE object_key = ANY($1)',
        [batch],
      );
      const used = new Set(
        rows.map((r: { object_key: string }) => r.object_key),
      );
      for (const key of batch) {
        if (used.has(key) || removed >= MAX_DELETES) continue;
        await this.bucket!.remove(key);
        removed++;
      }
      batch = [];
    };
    for await (const o of this.bucket.list('event-covers/')) {
      if (now.getTime() - o.lastModified.getTime() < MIN_AGE_MS) continue;
      batch.push(o.key);
      if (batch.length >= BATCH) await flush();
      if (removed >= MAX_DELETES) break;
    }
    await flush();
    return removed;
  }
}
