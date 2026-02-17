import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../database/supabase.client';
import logger from '../common/utils/logger.util';

@Injectable()
export class NookCronJobs {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async deleteExpiredNooks() {
    const now = new Date().toISOString();

    const { data: expiredNooks, error } = await this.admin
      .from('nooks')
      .select('id')
      .lt('expires_at', now);

    if (error) {
      logger.error('Error fetching expired nooks', { module: 'NookCron', error: error.message });
      return;
    }

    if (expiredNooks && expiredNooks.length > 0) {
      const { error: deleteError } = await this.admin
        .from('nooks')
        .delete()
        .lt('expires_at', now);

      if (deleteError) {
        logger.error('Error deleting expired nooks', { module: 'NookCron', error: deleteError.message });
      } else {
        logger.info(`Deleted ${expiredNooks.length} expired nooks`, { module: 'NookCron' });
      }
    }
  }

  @Cron(CronExpression.EVERY_15_MINUTES)
  async updateAllNookTemperatures() {
    const now = new Date().toISOString();

    const { data: nooks, error } = await this.admin
      .from('nooks')
      .select('id')
      .eq('is_active', true)
      .gt('expires_at', now);

    if (error) {
      logger.error('Error fetching nooks for temperature update', { module: 'NookCron', error: error.message });
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
