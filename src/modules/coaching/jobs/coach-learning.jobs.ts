/**
 * Nightly consolidation of Coach's self-learning rulebook: dedups paraphrased
 * lessons, sums their support into weights, caps and prioritises. Runs on the
 * shared @nestjs/schedule scheduler (registered globally in AppModule).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CoachLearningService } from '../services/coach-learning.service';

@Injectable()
export class CoachLearningJobs {
  private readonly logger = new Logger(CoachLearningJobs.name);

  constructor(private readonly learning: CoachLearningService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async consolidateRulebook(): Promise<void> {
    const count = await this.learning.consolidate();
    if (count > 0) {
      this.logger.log(`Nightly rulebook consolidation done: ${count} rules.`);
    }
  }
}
