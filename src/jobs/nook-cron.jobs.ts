import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../database/supabase.client';
import { getPool } from '../database/pg-client';
import logger from '../common/utils/logger.util';

@Injectable()
export class NookCronJobs implements OnModuleInit {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async onModuleInit() {
    // Clean up expired nooks immediately on startup (catches any that expired while server was down)
    await this.deleteExpiredNooks();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async deleteExpiredNooks() {
    logger.info('Running expired nooks cleanup', { module: 'NookCron' });

    try {
      // Use raw SQL with the DB's own NOW() to avoid any JS/DB clock skew.
      const pool = getPool();
      const result = await pool.query<{ id: string; title: string }>(`
        DELETE FROM nooks
        WHERE expires_at < NOW()
        RETURNING id, title
      `);

      const deleted = result.rows;
      if (deleted.length === 0) {
        logger.info('No expired nooks to delete', { module: 'NookCron' });
      } else {
        logger.info(`Deleted ${deleted.length} expired nooks`, {
          module: 'NookCron',
          count: deleted.length,
          ids: deleted.map((n) => n.id),
          titles: deleted.map((n) => n.title),
        });
      }
    } catch (err: any) {
      logger.error('Error deleting expired nooks', {
        module: 'NookCron',
        error: err.message,
      });
    }
  }

  /**
   * Renew nooks that are about to expire (within 30 minutes) and still have
   * active engagement (messages in the last 12 hours). This keeps seeded and
   * active nooks alive so they don't silently disappear.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async renewExpiringNooks() {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
    const newExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h from now

    const { data: expiringNooks, error } = await this.admin
      .from('nooks')
      .select('id')
      .eq('is_active', true)
      .gt('expires_at', now.toISOString())
      .lt('expires_at', soonThreshold.toISOString());

    if (error) {
      logger.error('Error fetching expiring nooks', { module: 'NookCron', error: error.message });
      return;
    }

    if (expiringNooks && expiringNooks.length > 0) {
      const ids = expiringNooks.map((n: any) => n.id);
      const { error: updateError } = await this.admin
        .from('nooks')
        .update({ expires_at: newExpiresAt.toISOString() })
        .in('id', ids);

      if (updateError) {
        logger.error('Error renewing nooks', { module: 'NookCron', error: updateError.message });
      } else {
        logger.info(`Renewed ${expiringNooks.length} expiring nooks for another 24h`, { module: 'NookCron' });
      }
    }
  }

  @Cron('0 */15 * * * *')
  async updateAllNookTemperatures() {
    const now = new Date().toISOString();

    const { data: nooks, error } = await this.admin
      .from('nooks')
      .select('id')
      .eq('is_active', true)
      .gt('expires_at', now);

    if (error) {
      logger.error('Error fetching nooks for temperature update', {
        module: 'NookCron',
        error: error.message,
      });
      return;
    }

    if (nooks) {
      for (const nook of nooks) {
        await this.updateNookTemperature(nook.id);
      }
    }
  }

  private async updateNookTemperature(nookId: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { count: recentMessages } = await this.admin
      .from('nook_messages')
      .select('*', { count: 'exact', head: true })
      .eq('nook_id', nookId)
      .gte('created_at', oneHourAgo.toISOString());

    let temperature = 'cool';
    if ((recentMessages ?? 0) >= 10) {
      temperature = 'hot';
    } else if ((recentMessages ?? 0) >= 3) {
      temperature = 'warm';
    }

    await this.admin.from('nooks').update({ temperature }).eq('id', nookId);
  }
}
