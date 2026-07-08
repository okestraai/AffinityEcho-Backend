import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsAdminController } from './analytics-admin.controller';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { AnalyticsQueryService } from './analytics-query.service';

@Module({
  // AuthModule provides the JWT passport strategy (for JwtAuthGuard) and
  // re-exports JwtModule (for the JwtService the public controller uses to
  // optionally decode a Bearer token) — no separate JwtModule registration.
  imports: [AuthModule],
  controllers: [AnalyticsController, AnalyticsAdminController],
  providers: [AnalyticsIngestService, AnalyticsQueryService, PermissionGuard],
})
export class AnalyticsModule {}
