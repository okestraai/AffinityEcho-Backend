jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('pdfkit', () => jest.fn().mockImplementation(() => ({ pipe: jest.fn(), text: jest.fn().mockReturnThis(), moveDown: jest.fn().mockReturnThis(), fontSize: jest.fn().mockReturnThis(), font: jest.fn().mockReturnThis(), end: jest.fn(), on: jest.fn() })));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminNotificationsService } from '../../modules/admin/services/admin-notifications.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };
    service = new AdminNotificationsService(createMockConfigService() as any, mockAdminUsers as any);
  });

  describe('listNotifications', () => {
    it('should return paginated notifications', async () => {
      const listChain = createMockQueryChain({ data: [{ id: 'n1', title: 'Test', status: 'draft' }], error: null, count: 1 });
      const summaryChain = createMockQueryChain({ data: [{ status: 'draft' }, { status: 'sent' }], error: null });

      mockClient.from
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(summaryChain);

      const result = await service.listNotifications({});
      expect(result.success).toBe(true);
    });

    it('should filter by status', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      await service.listNotifications({ status: 'sent' });
      expect(chain.eq).toHaveBeenCalledWith('status', 'sent');
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listNotifications({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNotification', () => {
    it.skip('should create admin notification', async () => {
      const insertChain = createMockQueryChain({ data: { id: 'n1', title: 'Test' }, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(logChain);

      const result = await service.createNotification('admin-1', {
        title: 'Test', body: 'Body', type: 'announcement', audience: 'all',
      } as any);
      expect(result.success).toBe(true);
    });

    it.skip('should throw on insert error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.createNotification('admin-1', { title: 'T' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteNotification', () => {
    it.skip('should delete notification', async () => {
      const fetchChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(logChain);

      const result = await service.deleteNotification('n1', 'admin-1');
      expect(result.success).toBe(true);
    });

    it('should throw if not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValue(chain);

      await expect(service.deleteNotification('nope', 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });
});
