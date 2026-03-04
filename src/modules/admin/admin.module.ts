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
  ],
})
export class AdminModule {}
