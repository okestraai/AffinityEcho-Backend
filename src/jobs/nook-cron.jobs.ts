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
