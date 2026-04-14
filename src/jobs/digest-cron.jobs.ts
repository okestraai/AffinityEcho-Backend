import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../database/supabase.client';
import { EmailService } from '../common/utils/email/email.service';
import logger from '../common/utils/logger.util';

@Injectable()
export class DigestCronJobs {
  private admin;

  constructor(
    private config: ConfigService,
    private emailService: EmailService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // Runs every day at 8:00 AM UTC — checks admin-configured frequency to decide what to send
  @Cron('0 0 8 * * *')
  async sendDailyDigests() {
    await this.sendDigests();
  }

  private async getAdminDigestFrequency(): Promise<
    'daily' | 'weekly' | 'never'
  > {
    try {
      const { data } = await this.admin
        .from('system_settings')
        .select('value')
        .eq('key', 'notifications')
        .single();
      return data?.value?.digest_frequency ?? 'daily';
    } catch {
      return 'daily';
    }
  }

  private async sendDigests() {
    const frequency = await this.getAdminDigestFrequency();

    if (frequency === 'never') {
      logger.info('Digest disabled by admin — skipping', {
        module: 'DigestCron',
      });
      return;
    }

    const today = new Date();
    const isMonday = today.getUTCDay() === 1;

    // Weekly frequency: only send on Mondays
    if (frequency === 'weekly' && !isMonday) {
      return;
    }

    const days = frequency === 'weekly' ? 7 : 1;
    logger.info(`Starting ${frequency} digest run`, { module: 'DigestCron' });

    try {
      // All users with email_notifications on — digest frequency is platform-wide
      const { data: users, error } = await this.admin
        .from('user_profiles')
        .select('id, email, username')
        .eq('email_notifications', true)
        .eq('is_deleted', false)
        .eq('is_deactivated', false);

      if (error) {
        logger.error(`Failed to fetch ${frequency} digest users`, {
          module: 'DigestCron',
          error: error.message,
        });
        return;
      }

      if (!users || users.length === 0) {
        logger.info(`No users for ${frequency} digest`, {
          module: 'DigestCron',
        });
        return;
      }

      const since = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();

      let sent = 0;
      let skipped = 0;

      for (const user of users) {
        try {
          // Fetch undelivered in-app notifications since the period start
          const { data: notifications } = await this.admin
            .from('notifications')
            .select('title, message, type, created_at')
            .eq('user_id', user.id)
            .eq('is_delivered', false)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(20);

          if (!notifications || notifications.length === 0) {
            skipped++;
            continue;
          }

          const period: 'Daily' | 'Weekly' =
            frequency === 'weekly' ? 'Weekly' : 'Daily';
          await this.emailService.sendDigestEmail(
            user.email,
            user.username || 'Friend',
            period,
            notifications.map((n: any) => ({
              title: n.title,
              message: n.message,
            })),
          );

          // Mark those notifications as delivered so they don't appear in next digest
          const notificationIds = notifications
            .map((n: any) => n.id)
            .filter(Boolean);
          if (notificationIds.length > 0) {
            await this.admin
              .from('notifications')
              .update({
                is_delivered: true,
                delivered_at: new Date().toISOString(),
              })
              .in('id', notificationIds);
          }

          sent++;
        } catch (userError: any) {
          logger.warn(`Digest failed for user ${user.id}`, {
            module: 'DigestCron',
            error: userError.message,
          });
        }
      }

      logger.info(`${frequency} digest complete`, {
        module: 'DigestCron',
        total: users.length,
        sent,
        skipped,
      });
    } catch (err: any) {
      logger.error(`${frequency} digest run failed`, {
        module: 'DigestCron',
        error: err.message,
      });
    }
  }
}
