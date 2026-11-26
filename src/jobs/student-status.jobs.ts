import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../database/supabase.client';
import { NotificationsService } from '../modules/notifications/notifications.service';
import logger from '../common/utils/logger.util';

// A student is asked again only after this many days.
const ASK_AGAIN_AFTER_DAYS = 60;
const BATCH = 200;
const MAX_BATCHES = 1000;

@Injectable()
export class StudentStatusJobs {
  private admin;

  constructor(
    config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    this.admin = supabaseAdmin(config);
  }

  // 09:00 on 1 January and 1 September.
  @Cron('0 0 9 1 1,9 *')
  async askStudents() {
    try {
      const asked = await this.askAll(new Date());
      logger.info('Asked students if they are still studying', { asked });
    } catch (error) {
      logger.error('Student status check failed', { error });
    }
  }

  async askAll(now: Date): Promise<number> {
    const nowIso = now.toISOString();
    const cutoff = new Date(
      now.getTime() - ASK_AGAIN_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const notAskedLately = `student_status_checked_at.is.null,student_status_checked_at.lt.${cutoff}`;
    let asked = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data, error } = await this.admin
        .from('user_profiles')
        .select('id')
        .eq('is_student', true)
        .or(notAskedLately)
        .limit(BATCH);
      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const { id } of data) {
        // Claiming the row first means a second server never asks the same student twice.
        const { data: claimed } = await this.admin
          .from('user_profiles')
          .update({ student_status_checked_at: nowIso })
          .eq('id', id)
          .eq('is_student', true)
          .or(notAskedLately)
          .select('id');
        if (!claimed?.length) continue;
        await this.notifications
          .createNotification({
            user_id: id,
            type: 'student_status_check',
            title: 'Still a student?',
            message:
              'Tell us if you are still studying, so you keep the right spaces.',
            action_url: '/dashboard/profile?student-check=1',
          } as any)
          .catch((err) =>
            logger.warn('Could not send the student check', {
              userId: id,
              err,
            }),
          );
        asked += 1;
      }
    }
    return asked;
  }
}
