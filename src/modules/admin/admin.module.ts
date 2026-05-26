import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminReportsService } from './services/admin-reports.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminForumsService } from './services/admin-forums.service';
import { AdminNooksService } from './services/admin-nooks.service';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminLogsService } from './services/admin-logs.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminPermissionsService } from './services/admin-permissions.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';
import { AdminHealthService } from './services/admin-health.service';
import { ContentSafetyService } from '../content-safety/content-safety.service';
import { ModerationReviewService } from './services/moderation-review.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { EmailService } from '../../common/utils/email/email.service';
import { RedisService } from '../../common/services/redis.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminReportsService,
    AdminModerationService,
    AdminForumsService,
    AdminNooksService,
    AdminNotificationsService,
    AdminLogsService,
    AdminSettingsService,
    AdminPermissionsService,
    AdminAnalyticsService,
    AdminHealthService,
    ContentSafetyService,
    ModerationReviewService,
    PermissionGuard,
    EncryptionUtil,
    EmailService,
    RedisService,
  ],
  exports: [AdminHealthService],
})
export class AdminModule {}
