import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiParam } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { RegisterPushTokenDto, RemovePushTokenDto } from './dto/push-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushNotificationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a notification (admin/system use)' })
  @ApiBody({ type: CreateNotificationDto })
  async createNotification(@Body() createDto: CreateNotificationDto) {
    return this.notificationsService.createNotification(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  async getUserNotifications(@Req() req: any, @Query() query: QueryNotificationDto) {
    const userId = req.user.sub;
    return this.notificationsService.getUserNotifications(userId, query);
  }

  @Get('unread-count')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: any) {
    const userId = req.user.sub;
    return this.notificationsService.getUnreadCount(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get notification statistics' })
  async getStats(@Req() req: any) {
    const userId = req.user.sub;
    return this.notificationsService.getNotificationStats(userId);
  }

  // Static routes MUST come before parameterized :id routes
  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req: any) {
    const userId = req.user.sub;
    return this.notificationsService.markAllAsRead(userId);
  }

  // Static delete route MUST come before parameterized :id route
  @Delete('read/all')
  @ApiOperation({ summary: 'Delete all read notifications' })
  async deleteAllRead(@Req() req: any) {
    const userId = req.user.sub;
    return this.notificationsService.deleteAllRead(userId);
  }

  @Delete('all')
  @ApiOperation({ summary: 'Clear all notifications (read and unread)' })
  async deleteAll(@Req() req: any) {
    const userId = req.user.sub;
    return this.notificationsService.deleteAll(userId);
  }

  // ============ PUSH TOKEN ENDPOINTS ============

  @Post('push-token')
  @ApiOperation({ summary: 'Register a push notification token' })
  @ApiBody({ type: RegisterPushTokenDto })
  async registerPushToken(@Req() req: any, @Body() dto: RegisterPushTokenDto) {
    const userId = req.user.sub;
    return this.pushService.registerToken(userId, dto.token, dto.platform, dto.device_name);
  }

  @Delete('push-token')
  @ApiOperation({ summary: 'Remove a push notification token (e.g. on logout)' })
  @ApiBody({ type: RemovePushTokenDto })
  async removePushToken(@Req() req: any, @Body() dto: RemovePushTokenDto) {
    const userId = req.user.sub;
    return this.pushService.removeToken(userId, dto.token);
  }

  // ============ PARAMETERIZED ROUTES ============

  @Get(':id')
  @ApiOperation({ summary: 'Get notification by ID' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async getNotificationById(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.notificationsService.getNotificationById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update notification' })
  @ApiBody({ type: UpdateNotificationDto })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async updateNotification(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateNotificationDto,
  ) {
    const userId = req.user.sub;
    return this.notificationsService.updateNotification(id, userId, updateDto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.notificationsService.markAsRead(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  async deleteNotification(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.notificationsService.deleteNotification(id, userId);
  }
}
