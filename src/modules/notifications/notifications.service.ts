import { Injectable, Inject, Logger, NotFoundException, BadRequestException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../../database/supabase.client';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { NOTIFICATION_FIELDS, NOTIFICATION_FIELDS_WITH_ACTOR } from '../../common/constants/select-fields';
import { ChatGateway } from '../messaging/services/websocket.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private admin;

  // Map notification types to user preference columns
  private static readonly PREFERENCE_MAP: Record<string, string> = {
    forum_like: 'notify_on_like',
    feed_like: 'notify_on_like',
    referral_like: 'notify_on_like',
    post_reaction: 'notify_on_like',
    forum_comment: 'notify_on_comment',
    referral_comment: 'notify_on_comment',
    topic_comment: 'notify_on_comment',
    user_followed: 'notify_on_follow',
    user_unfollowed: 'notify_on_follow',
    referral_connection: 'notify_on_connection_request',
    mentorship_request: 'notify_on_connection_request',
    message_received: 'notify_on_message',
    mention: 'notify_on_mention',
    followed_user_post: 'notify_on_follow',
    // nook_reply, report_status_update — NOT in map, always send
  };

  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => ChatGateway)) private chatGateway: ChatGateway,
  ) {
    this.admin = supabaseAdmin(config);
  }

  /**
   * Check if user has enabled the notification preference for a given type
   */
  private async shouldNotify(userId: string, notificationType: string): Promise<boolean> {
    const prefColumn = NotificationsService.PREFERENCE_MAP[notificationType];
    // Types without a mapping (mentorship status, session updates, identity reveals) always send
    if (!prefColumn) return true;

    try {
      const { data } = await this.admin
        .from('user_profiles')
        .select('push_notifications, notify_on_like, notify_on_comment, notify_on_follow, notify_on_connection_request, notify_on_message, notify_on_mention')
        .eq('id', userId)
        .single();

      const prefs = data as any;
      if (!prefs) return true;
      // Master toggle off → skip all
      if (prefs.push_notifications === false) return false;
      // Specific preference off → skip
      if (prefs[prefColumn] === false) return false;
      return true;
    } catch {
      return true; // On error, still send
    }
  }

  /**
   * Create a new notification
   */
  async createNotification(dto: CreateNotificationDto) {
    try {
      // Check user notification preferences before creating
      const allowed = await this.shouldNotify(dto.user_id, dto.type);
      if (!allowed) {
        this.logger.log(`Notification skipped (user preference): ${dto.type} for user ${dto.user_id}`);
        return { success: true, message: 'Notification skipped by user preference', data: null };
      }

      const notificationData = {
        id: randomUUID(),
        user_id: dto.user_id,
        actor_id: dto.actor_id || null,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        action_url: dto.action_url || null,
        reference_id: dto.reference_id || null,
        reference_type: dto.reference_type || null,
        metadata: dto.metadata || {},
        delivery_method: dto.delivery_method || ['in_app'],
        is_read: false,
        is_delivered: false,
        action_taken: false,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await this.admin
        .from('notifications')
        .insert(notificationData)
        .select(NOTIFICATION_FIELDS)
        .single();

      if (error) {
        this.logger.error('Failed to create notification:', error);
        throw error;
      }

      this.logger.log(`Notification created: ${data.id} for user ${dto.user_id}`);

      // Push real-time notification via WebSocket
      try {
        this.chatGateway.emitToUser(dto.user_id, 'new_notification', data);
      } catch (wsError) {
        this.logger.warn('WebSocket push failed (user may be offline):', wsError);
      }

      return {
        success: true,
        message: 'Notification created successfully',
        data,
      };
    } catch (error: any) {
      this.logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create multiple notifications in bulk
   */
  async createBulkNotifications(notifications: CreateNotificationDto[]) {
    try {
      const notificationData = notifications.map((dto) => ({
        id: randomUUID(),
        user_id: dto.user_id,
        actor_id: dto.actor_id || null,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        action_url: dto.action_url || null,
        reference_id: dto.reference_id || null,
        reference_type: dto.reference_type || null,
        metadata: dto.metadata || {},
        delivery_method: dto.delivery_method || ['in_app'],
        is_read: false,
        is_delivered: false,
        action_taken: false,
        created_at: new Date().toISOString(),
      }));

      const { data, error } = await this.admin
        .from('notifications')
        .insert(notificationData)
        .select(NOTIFICATION_FIELDS);

      if (error) {
        this.logger.error('Failed to create bulk notifications:', error);
        throw error;
      }

      this.logger.log(`${data.length} notifications created`);

      // Push real-time notifications via WebSocket
      try {
        data.forEach((notification: any) => {
          this.chatGateway.emitToUser(notification.user_id, 'new_notification', notification);
        });
      } catch (wsError) {
        this.logger.warn('WebSocket bulk push failed:', wsError);
      }

      return {
        success: true,
        message: `${data.length} notifications created successfully`,
        data,
      };
    } catch (error: any) {
      this.logger.error('Error creating bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Get user notifications with filters and pagination
   */
  async getUserNotifications(userId: string, query: QueryNotificationDto) {
    try {
      const { is_read, type, page = 1, limit = 20 } = query;
      const offset = (page - 1) * limit;

      let supabaseQuery = this.admin
        .from('notifications')
        .select(NOTIFICATION_FIELDS_WITH_ACTOR, { count: 'exact' })
        .eq('user_id', userId);

      // Apply filters
      if (typeof is_read === 'boolean') {
        supabaseQuery = supabaseQuery.eq('is_read', is_read);
      }

      if (type) {
        supabaseQuery = supabaseQuery.eq('type', type);
      }

      // Order by created_at desc (newest first)
      supabaseQuery = supabaseQuery.order('created_at', { ascending: false });

      // Apply pagination
      const { data, error, count } = await supabaseQuery.range(
        offset,
        offset + limit - 1,
      );

      if (error) {
        this.logger.error('Failed to fetch notifications:', error);
        throw error;
      }

      return {
        success: true,
        message: 'Notifications retrieved successfully',
        data: data || [],
        pagination: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    } catch (error: any) {
      this.logger.error('Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification by ID
   */
  async getNotificationById(notificationId: string, userId: string) {
    try {
      const { data, error } = await this.admin
        .from('notifications')
        .select(NOTIFICATION_FIELDS_WITH_ACTOR)
        .eq('id', notificationId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        throw new NotFoundException('Notification not found');
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      this.logger.error('Error fetching notification:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    try {
      const { data, error } = await this.admin
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select(NOTIFICATION_FIELDS)
        .single();

      if (error) {
        throw new NotFoundException('Notification not found');
      }

      return {
        success: true,
        message: 'Notification marked as read',
        data,
      };
    } catch (error: any) {
      this.logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    try {
      const { data, error } = await this.admin
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select(NOTIFICATION_FIELDS);

      if (error) {
        this.logger.error('Failed to mark all notifications as read:', error);
        throw error;
      }

      return {
        success: true,
        message: `${data?.length || 0} notifications marked as read`,
        count: data?.length || 0,
      };
    } catch (error: any) {
      this.logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Update notification
   */
  async updateNotification(
    notificationId: string,
    userId: string,
    updateDto: UpdateNotificationDto,
  ) {
    try {
      const updateData: any = {};

      if (typeof updateDto.is_read === 'boolean') {
        updateData.is_read = updateDto.is_read;
        if (updateDto.is_read) {
          updateData.read_at = new Date().toISOString();
        }
      }

      if (typeof updateDto.action_taken === 'boolean') {
        updateData.action_taken = updateDto.action_taken;
      }

      if (typeof updateDto.is_delivered === 'boolean') {
        updateData.is_delivered = updateDto.is_delivered;
        if (updateDto.is_delivered) {
          updateData.delivered_at = new Date().toISOString();
        }
      }

      const { data, error } = await this.admin
        .from('notifications')
        .update(updateData)
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select(NOTIFICATION_FIELDS)
        .single();

      if (error) {
        throw new NotFoundException('Notification not found');
      }

      return {
        success: true,
        message: 'Notification updated successfully',
        data,
      };
    } catch (error: any) {
      this.logger.error('Error updating notification:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string) {
    try {
      const { error } = await this.admin
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (error) {
        this.logger.error('Failed to delete notification:', error);
        throw new NotFoundException('Notification not found');
      }

      return {
        success: true,
        message: 'Notification deleted successfully',
      };
    } catch (error: any) {
      this.logger.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Delete all notifications (read and unread) for a user
   */
  async deleteAll(userId: string) {
    const { error, count } = await this.admin
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    if (error) {
      this.logger.error('Failed to delete all notifications', { error, userId });
      throw new BadRequestException('Failed to clear all notifications');
    }

    return {
      success: true,
      message: 'All notifications cleared',
      data: { deleted_count: count || 0 },
    };
  }

  /**
   * Delete all read notifications for a user
   */
  async deleteAllRead(userId: string) {
    try {
      const { data, error } = await this.admin
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .eq('is_read', true)
        .select(NOTIFICATION_FIELDS);

      if (error) {
        this.logger.error('Failed to delete read notifications:', error);
        throw error;
      }

      return {
        success: true,
        message: `${data?.length || 0} notifications deleted`,
        count: data?.length || 0,
      };
    } catch (error: any) {
      this.logger.error('Error deleting read notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string) {
    try {
      const { count, error } = await this.admin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        this.logger.error('Failed to get unread count:', error);
        throw error;
      }

      return {
        success: true,
        count: count || 0,
      };
    } catch (error: any) {
      this.logger.error('Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Get notification stats (counts by type)
   */
  async getNotificationStats(userId: string) {
    try {
      const { data, error } = await this.admin
        .from('notifications')
        .select('type, is_read')
        .eq('user_id', userId);

      if (error) {
        this.logger.error('Failed to get notification stats:', error);
        throw error;
      }

      const stats = {
        total: data?.length || 0,
        unread: data?.filter((n) => !n.is_read).length || 0,
        byType: {} as Record<string, { total: number; unread: number }>,
      };

      data?.forEach((notification) => {
        if (!stats.byType[notification.type]) {
          stats.byType[notification.type] = { total: 0, unread: 0 };
        }
        stats.byType[notification.type].total++;
        if (!notification.is_read) {
          stats.byType[notification.type].unread++;
        }
      });

      return {
        success: true,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error('Error getting notification stats:', error);
      throw error;
    }
  }
}
