jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminForumsService } from '../../modules/admin/services/admin-forums.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('AdminForumsService', () => {
  let service: AdminForumsService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };
    service = new AdminForumsService(createMockConfigService() as any, mockAdminUsers as any);
  });

  describe('listForums', () => {
    it('should return paginated forums', async () => {
      const chain = createMockQueryChain({
        data: [{ id: 'f1', name: 'Tech Forum', description: 'desc', created_at: '2026-01-01' }],
        error: null, count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listForums({} as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listForums({} as any);
      expect(result.data).toEqual([]);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listForums({} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('createForum', () => {
    it.skip('should create forum', async () => {
      const existsChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'f1', name: 'New Forum' }, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(logChain);

      const result = await service.createForum('admin-1', { name: 'New Forum', description: 'desc' } as any);
      expect(result.success).toBe(true);
    });

    it('should throw if name already exists', async () => {
      const chain = createMockQueryChain({ data: { id: 'existing' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.createForum('admin-1', { name: 'Existing' } as any)).rejects.toThrow();
    });
  });

  describe('updateForum', () => {
    it.skip('should update forum', async () => {
      const updateChain = createMockQueryChain({ data: { id: 'f1', name: 'Updated' }, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.updateForum('f1', 'admin-1', { name: 'Updated' } as any);
      expect(result.success).toBe(true);
    });
  });

  describe('deleteForum', () => {
    it.skip('should delete forum', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(logChain);

      const result = await service.deleteForum('f1', 'admin-1');
      expect(result.success).toBe(true);
    });
  });
});
