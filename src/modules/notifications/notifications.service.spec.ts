import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  createMockQueryChain,
  createMockSupabaseClient,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';

/* ------------------------------------------------------------------ */
/*  Module-level mocks                                                 */
/* ------------------------------------------------------------------ */
jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { supabaseAdmin } from '../../database/supabase.client';

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */
describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockClient: any;
  let mockChatGateway: { emitToUser: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockChatGateway = { emitToUser: jest.fn() };
    const mockConfig = createMockConfigService();
    const mockPushService = {
      sendPushNotification: jest.fn().mockResolvedValue(undefined),
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };

    service = new NotificationsService(
      mockConfig as any,
      mockChatGateway as any,
      mockPushService as any,
    );
  });

  /* ================================================================ */
  /*  createNotification                                               */
  /* ================================================================ */
  describe('createNotification', () => {
    const dto = {
      user_id: 'user-1',
      actor_id: 'actor-1',
      type: 'mentorship_request',
      title: 'New mentorship request',
      message: 'Someone wants to be your mentee',
      action_url: '/mentorship/requests',
      reference_id: 'ref-1',
      reference_type: 'mentorship',
      metadata: {},
      delivery_method: ['in_app'],
    };

    it('should create a notification and emit a WebSocket event', async () => {
      const createdNotification = {
        id: 'notif-1',
        user_id: dto.user_id,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        is_read: false,
      };

      // 1st from(): shouldNotify — fetch user_profiles preferences
      // For 'mentorship_request' type, PREFERENCE_MAP maps to 'notify_on_connection_request'
      const prefChain = createMockQueryChain({
        data: {
          push_notifications: true,
          notify_on_connection_request: true,
        },
        error: null,
      });
      // 2nd from(): insert notification
      const insertChain = createMockQueryChain({
        data: createdNotification,
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(prefChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.createNotification(dto as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Notification sent');
      expect(result.data).toEqual(createdNotification);
      expect(mockChatGateway.emitToUser).toHaveBeenCalledWith(
        dto.user_id,
        'new_notification',
        createdNotification,
      );
    });

    it('should skip notification when user preference disallows', async () => {
      const likeDto = {
        ...dto,
        type: 'forum_like',
      };

      // shouldNotify — user has notify_on_like = false
      const prefChain = createMockQueryChain({
        data: {
          push_notifications: true,
          notify_on_like: false,
          notify_on_comment: true,
          notify_on_follow: true,
          notify_on_connection_request: true,
        },
        error: null,
      });

      mockClient.from.mockReturnValueOnce(prefChain);

      const result = await service.createNotification(likeDto as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Notification skipped per your preferences');
      expect(result.data).toBeNull();
      expect(mockChatGateway.emitToUser).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  getUserNotifications                                             */
  /* ================================================================ */
  describe('getUserNotifications', () => {
    it('should return paginated notifications', async () => {
      const notifications = [
        { id: 'notif-1', type: 'forum_like', is_read: false },
        { id: 'notif-2', type: 'forum_comment', is_read: true },
      ];

      const chain = createMockQueryChain({
        data: notifications,
        error: null,
        count: 2,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUserNotifications('user-1', {
        page: 1,
        limit: 20,
      } as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(notifications);
      expect(result.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(mockClient.from).toHaveBeenCalledWith('notifications');
    });
  });

  /* ================================================================ */
  /*  markAsRead                                                       */
  /* ================================================================ */
  describe('markAsRead', () => {
    it('should mark a single notification as read', async () => {
      const updated = {
        id: 'notif-1',
        is_read: true,
        read_at: '2026-01-01T00:00:00.000Z',
      };

      const chain = createMockQueryChain({ data: updated, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.markAsRead('notif-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Marked as read');
      expect(result.data).toEqual(updated);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_read: true }),
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'notif-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  /* ================================================================ */
  /*  markAllAsRead                                                    */
  /* ================================================================ */
  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const updatedNotifications = [
        { id: 'notif-1', is_read: true },
        { id: 'notif-2', is_read: true },
      ];

      const chain = createMockQueryChain({
        data: updatedNotifications,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.markAllAsRead('user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('2 notifications marked as read');
      expect(result.count).toBe(2);
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('is_read', false);
    });
  });

  /* ================================================================ */
  /*  getUnreadCount                                                   */
  /* ================================================================ */
  describe('getUnreadCount', () => {
    it('should return the unread notification count', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: null,
        count: 7,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ success: true, count: 7 });
      expect(mockClient.from).toHaveBeenCalledWith('notifications');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('is_read', false);
    });
  });

  /* ================================================================ */
  /*  deleteNotification                                               */
  /* ================================================================ */
  describe('deleteNotification', () => {
    it('should delete a notification', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.deleteNotification('notif-1', 'user-1');

      expect(result).toEqual({
        success: true,
        message: 'Notification removed',
      });
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'notif-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  /* ================================================================ */
  /*  getNotificationStats                                             */
  /* ================================================================ */
  describe('getNotificationStats', () => {
    it('should return stats grouped by type', async () => {
      const notifications = [
        { type: 'forum_like', is_read: false },
        { type: 'forum_like', is_read: true },
        { type: 'forum_comment', is_read: false },
      ];

      const chain = createMockQueryChain({
        data: notifications,
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getNotificationStats('user-1');

      expect(result.success).toBe(true);
      expect(result.data.total).toBe(3);
      expect(result.data.unread).toBe(2);
      expect(result.data.byType).toEqual({
        forum_like: { total: 2, unread: 1 },
        forum_comment: { total: 1, unread: 1 },
      });
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });
});
