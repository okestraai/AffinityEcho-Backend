import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminHealthService } from '../modules/admin/services/admin-health.service';
import logger from '../common/utils/logger.util';

@Injectable()
export class HealthCronJobs {
  constructor(private healthService: AdminHealthService) {}

  /**
   * Run health checks every 5 minutes and store results.
   * Auto-alerts admins if a module is down for 3+ consecutive checks.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runHealthCheck() {
    try {
      await this.healthService.storeHealthCheck();
      logger.info('Health check completed');
    } catch (error: any) {
      logger.error('Health check cron failed', { error: error.message });
    }
  }
}
