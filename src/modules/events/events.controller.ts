import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { EventsService } from './events.service';
import { EventsAdminService } from './events-admin.service';
import {
  CheckInDto,
  CreateEventDto,
  RegisterDto,
  RegistrationSharingDto,
  RemoveEventDto,
  ReportEventDto,
  UpdateEventDto,
} from './dto/event.dto';

const SLUG = /^[a-z0-9-]{3,80}$/;

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @Get('public/:slug')
  @ApiOperation({ summary: 'The public event page: venue name and city, never the address or join link' })
  publicView(@Param('slug') slug: string) {
    return this.events.publicView(cleanSlug(slug));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('mine')
  @ApiOperation({ summary: 'My Events: registered (active and past) and hosting' })
  mine(@CurrentUser() user: any) {
    return this.events.myEvents(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':slug')
  @ApiOperation({ summary: 'The event for a signed-in member, with full details for guests and the host' })
  memberView(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.events.memberView(cleanSlug(slug), user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Host an event (onboarded members, up to 5 a day)' })
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.events.create(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch(':eventId')
  @ApiOperation({ summary: 'Edit your event; guests hear about changes grouped over 2 minutes' })
  update(
    @CurrentUser() user: any,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(user.userId, eventId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':eventId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel your event; guests are told' })
  cancel(@CurrentUser() user: any, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.cancel(user.userId, eventId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':eventId/host')
  @ApiOperation({ summary: 'Host page: link opens, registrations and the guest list' })
  hostPage(@CurrentUser() user: any, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.events.hostPage(user.userId, eventId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':eventId/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check a guest in by code (QR) or from the guest list' })
  checkIn(
    @CurrentUser() user: any,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CheckInDto,
  ) {
    return this.events.checkIn(user.userId, eventId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':eventId/guests.csv')
  @ApiOperation({ summary: 'Guest list as CSV (emails only for guests who shared them)' })
  async guestCsv(
    @CurrentUser() user: any,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Res() res: Response,
  ) {
    // Sent as a file, not wrapped in the usual JSON reply.
    const csv = await this.events.guestCsv(user.userId, eventId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="guests.csv"');
    res.send(csv);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':slug/register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register for an event. Your name is shown to the host; your email only if you choose.' })
  register(@CurrentUser() user: any, @Param('slug') slug: string, @Body() dto: RegisterDto) {
    return this.events.register(user.userId, cleanSlug(slug), dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch(':slug/registration')
  @ApiOperation({ summary: 'Change whether the host sees your email (until the event ends)' })
  setSharing(@CurrentUser() user: any, @Param('slug') slug: string, @Body() dto: RegistrationSharingDto) {
    return this.events.setSharing(user.userId, cleanSlug(slug), dto.shareEmail);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete(':slug/registration')
  @ApiOperation({ summary: 'Cancel your registration' })
  cancelRegistration(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.events.cancelRegistration(user.userId, cleanSlug(slug));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':eventId/report')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Report an event to the moderators' })
  report(
    @CurrentUser() user: any,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReportEventDto,
  ) {
    return this.events.report(user.userId, eventId, dto.reason);
  }
}

@ApiTags('Admin - Events')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/events')
export class AdminEventsController {
  constructor(private readonly admin: EventsAdminService) {}

  @Get()
  @RequirePermission('events:view')
  @ApiOperation({ summary: 'Events list, with open reports' })
  list(@Query() query: { status?: string; reported?: string; page?: string; limit?: string }) {
    return this.admin.list(query);
  }

  @Post(':eventId/remove')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('events:manage')
  @ApiOperation({ summary: 'Remove an event; guests are told it is off' })
  remove(@Req() req: any, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: RemoveEventDto) {
    return this.admin.remove(actor(req), eventId, dto.reason);
  }

  @Post(':eventId/reports/dismiss')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('events:manage')
  @ApiOperation({ summary: 'Dismiss the open reports on an event' })
  dismiss(@Req() req: any, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.admin.dismissReports(actor(req), eventId);
  }

  @Post('hosts/:userId/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('events:manage')
  @ApiOperation({ summary: 'Stop a member from hosting events' })
  stopHost(@Req() req: any, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: RemoveEventDto) {
    return this.admin.stopHost(actor(req), userId, dto.reason);
  }

  @Post('hosts/:userId/allow')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('events:manage')
  @ApiOperation({ summary: 'Let a stopped member host again' })
  allowHost(@Req() req: any, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.admin.allowHost(actor(req), userId);
  }
}

function actor(req: any) {
  return {
    id: req.user.userId,
    username: req.user.username,
    ip: req.headers?.['x-forwarded-for']?.split(',')[0] ?? req.socket?.remoteAddress,
  };
}

function cleanSlug(slug: string): string {
  const s = String(slug ?? '').toLowerCase();
  return SLUG.test(s) ? s : '__invalid__';
}
