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
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
  })),
);

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminNotificationsService } from '../../modules/admin/services/admin-notifications.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  let mockClient: any;
  const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminNotificationsService(
      createMockConfigService() as any,
      mockAdminUsers as any,
    );
  });

  describe('listNotifications', () => {
    it('should return paginated notifications', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            id: 'n1',
            title: 'System Update',
            message: 'New feature',
            type: 'system',
            audience: 'all',
            status: 'draft',
            created_at: '2026-01-01',
          },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listNotifications({});
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listNotifications({});
      expect(result.data.items).toEqual([]);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listNotifications({})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createNotification', () => {
    it('should create notification', async () => {
      const insertChain = createMockQueryChain({
        data: { id: 'n1', title: 'Test', status: 'draft' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.createNotification('admin-1', 'AdminUser', {
        title: 'Test',
        message: 'Hello',
        type: 'system',
        audience: 'all',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sendNotification', () => {
    it('should throw if notification not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.sendNotification('admin-1', 'AdminUser', 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'n1', status: 'draft' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.deleteNotification(
        'admin-1',
        'AdminUser',
        'n1',
      );
      expect(result).toBeNull();
    });
  });

  describe('listNotifications', () => {
    it('should return paginated notifications with summary', async () => {
      const listChain = createMockQueryChain({
        data: [{ id: 'n1', status: 'sent', title: 'Hello', type: 'system', audience: 'all' }],
        error: null,
        count: 1,
      });
      const summaryChain = createMockQueryChain({
        data: [{ status: 'sent', recipients_count: 100 }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(summaryChain);

      const result = await service.listNotifications({ page: '1', limit: '10' });
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.summary.sent).toBe(1);
    });

    it('should apply filters', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      const summaryChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain).mockReturnValueOnce(summaryChain);

      const result = await service.listNotifications({ status: 'sent', audience: 'all', type: 'system' });
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('status', 'sent');
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.listNotifications({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('notifyUser', () => {
    it('should notify a user', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.notifyUser('admin-1', 'Admin', 'u1', 'Title', 'Msg', 'system');
      expect(result.success).toBe(true);
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.notifyUser('admin-1', 'Admin', 'u1', 'Title', 'Msg', 'system'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exportNotifications - CSV', () => {
    it('should export notifications as CSV', async () => {
      const chain = createMockQueryChain({
        data: [{ id: 'n1', title: 'Test', type: 'system', audience: 'all', status: 'sent', recipients_count: 100, sent_at: '2026-01-01', scheduled_at: null, created_at: '2026-01-01' }],
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.exportNotifications({}, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('.csv');
      expect(result.contentType).toContain('text/csv');
    });

    it('should throw on DB error during export', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.exportNotifications({}, 'csv')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNotification - validation', () => {
    it('should throw if title is missing', async () => {
      await expect(
        service.createNotification('admin-1', 'Admin', { title: '', message: 'msg', type: 'system', audience: 'all' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if schedule action missing scheduled_at', async () => {
      await expect(
        service.createNotification('admin-1', 'Admin', { title: 'T', message: 'M', type: 'system', audience: 'all', action: 'schedule' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create and send notification immediately', async () => {
      const insertChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.createNotification('admin-1', 'Admin', {
        title: 'Alert',
        message: 'Important message',
        type: 'system',
        audience: 'all',
        action: 'send',
      });
      expect(result.success).toBe(true);
    });
  });
});
