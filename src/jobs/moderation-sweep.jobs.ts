import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getPool } from '../database/pg-client';
import logger from '../common/utils/logger.util';

const MODULE = 'ModerationSweep';

/**
 * Safety-net cron that catches content the real-time moderation queue missed.
 *
 * Runs every 10 minutes, finds items created in the last 2 hours with no
 * content_moderation audit row, and re-enqueues them for AI review.
 */
@Injectable()
export class ModerationSweepJobs {
  private enabled: boolean;
  private lookbackMinutes: number;
  private maxPerSweep: number;

  private static readonly CONTENT_TABLES = [
    { table: 'feed_posts', type: 'feed_post', authorCol: 'user_id' },
    { table: 'feed_comments', type: 'feed_comment', authorCol: 'user_id' },
    { table: 'forum_topics', type: 'forum_topic', authorCol: 'user_id' },
    { table: 'forum_comments', type: 'forum_comment', authorCol: 'user_id' },
    { table: 'nooks', type: 'nook', authorCol: 'creator_id' },
    { table: 'nook_messages', type: 'nook_message', authorCol: 'user_id' },
    { table: 'referral_posts', type: 'referral_post', authorCol: 'user_id' },
    {
      table: 'referral_comments',
      type: 'referral_comment',
      authorCol: 'user_id',
    },
  ];

  constructor(
    private config: ConfigService,
    @InjectQueue('moderation') private moderationQueue: Queue,
  ) {
    this.enabled = this.config.get('MODERATION_SWEEP_ENABLED') === 'true';
    this.lookbackMinutes = parseInt(
      this.config.get('MODERATION_SWEEP_LOOKBACK_MINUTES') || '120',
      10,
    );
    this.maxPerSweep = parseInt(
      this.config.get('MODERATION_SWEEP_MAX_PER_RUN') || '100',
      10,
    );
  }

  @Cron('0 */10 * * * *') // Every 10 minutes
  async sweepUnmoderatedContent() {
    if (!this.enabled) return;

    logger.info('Starting moderation sweep', { module: MODULE });

    try {
      const pool = getPool();
      let totalEnqueued = 0;
      const perType = Math.ceil(this.maxPerSweep / ModerationSweepJobs.CONTENT_TABLES.length);

      // Fetch all content types in parallel
      const allResults = await Promise.all(
        ModerationSweepJobs.CONTENT_TABLES.map(({ table, type, authorCol }) =>
          this.findUnmoderated(pool, table, type, authorCol, perType)
            .then((items) => items.map((item) => ({ type, item })))
            .catch(() => [] as { type: string; item: any }[]),
        ),
      );

      // Flatten and enqueue up to maxPerSweep
      const allItems = allResults.flat();
      for (const { type, item } of allItems) {
        if (totalEnqueued >= this.maxPerSweep) break;
        try {
          await this.moderationQueue.add(
            'moderate',
            {
              contentType: type,
              contentId: item.id,
              authorId: item.author_id,
            },
            {
              jobId: `${type}-${item.id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            },
          );
          totalEnqueued++;
        } catch {
          // Queue add failed — will retry next sweep
        }
      }

      // Log per-type counts
      for (const { table, type } of ModerationSweepJobs.CONTENT_TABLES) {
        const count = allItems.filter((r) => r.type === type).length;
        if (count > 0) {
          logger.info(`Sweep: enqueued ${count} ${type} items`, {
            module: MODULE,
            contentType: type,
            count,
          });
        }
      }

      if (totalEnqueued > 0) {
        logger.info(
          `Moderation sweep complete: ${totalEnqueued} items enqueued`,
          {
            module: MODULE,
            total: totalEnqueued,
          },
        );
      } else {
        logger.info('Moderation sweep: no unmoderated content found', {
          module: MODULE,
        });
      }
    } catch (err: any) {
      logger.error('Moderation sweep failed', {
        module: MODULE,
        error: err.message,
      });
    }
  }

  private async findUnmoderated(
    pool: any,
    table: string,
    contentType: string,
    authorCol: string,
    limit: number,
  ): Promise<Array<{ id: string; author_id: string }>> {
    // Skip nooks expiring in < 1 hour
    const nookExpireClause =
      table === 'nooks' ? `AND t.expires_at > NOW() + INTERVAL '1 hour'` : '';

    // Skip already hidden/removed content
    const hiddenClause = [
      'feed_posts',
      'forum_topics',
      'forum_comments',
      'nook_messages',
      'feed_comments',
    ].includes(table)
      ? `AND (t.is_hidden IS NULL OR t.is_hidden = false)`
      : table === 'nooks'
        ? `AND (t.is_hidden IS NULL OR t.is_hidden = false) AND t.deleted_at IS NULL`
        : '';

    const query = `
      SELECT t.id, t.${authorCol} AS author_id
      FROM ${table} t
      LEFT JOIN content_moderation cm
        ON cm.content_type = $1 AND cm.content_id = t.id
      WHERE t.created_at > NOW() - INTERVAL '${this.lookbackMinutes} minutes'
        AND cm.id IS NULL
        ${nookExpireClause}
        ${hiddenClause}
      ORDER BY t.created_at DESC
      LIMIT $2
    `;

    try {
      const result = await pool.query(query, [contentType, limit]);
      return result.rows;
    } catch (err: any) {
      logger.error(`Sweep query failed for ${table}`, {
        module: MODULE,
        table,
        error: err.message,
      });
      return [];
    }
  }
}
