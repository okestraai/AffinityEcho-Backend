import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AnalyticsQueryService } from './analytics-query.service';

// Admin-only visitor analytics reads. Reuses the existing 'analytics:view'
// permission (no RBAC changes). Mirrors the admin controller guard stack.
@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin/visitor-analytics')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AnalyticsAdminController {
  constructor(private readonly query: AnalyticsQueryService) {}

  @Get('overview')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Visitor analytics headline metrics' })
  overview(@Query('days') days?: string) {
    return this.query.overview(days ? Number(days) : undefined);
  }

  @Get('timeseries')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Daily visitors + pageviews series' })
  timeseries(@Query('days') days?: string) {
    return this.query.timeseries(days ? Number(days) : undefined);
  }

  @Get('referrers')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Acquisition sources + UTM campaigns' })
  referrers(@Query('days') days?: string) {
    return this.query.referrers(days ? Number(days) : undefined);
  }

  @Get('devices')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Device type / OS / browser breakdowns' })
  devices(@Query('days') days?: string) {
    return this.query.devices(days ? Number(days) : undefined);
  }

  @Get('geo')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Visitors by country' })
  geo(@Query('days') days?: string) {
    return this.query.geo(days ? Number(days) : undefined);
  }

  @Get('landing-pages')
  @RequirePermission('analytics:view')
  @ApiOperation({ summary: 'Top landing pages' })
  landingPages(@Query('days') days?: string) {
    return this.query.landingPages(days ? Number(days) : undefined);
  }
}
