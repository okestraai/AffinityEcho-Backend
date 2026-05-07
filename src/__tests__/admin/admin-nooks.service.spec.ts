jest.mock('../../database/supabase.client', () => ({ supabaseAdmin: jest.fn(), supabaseClient: jest.fn() }));
jest.mock('../../common/utils/logger.util', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminNooksService } from '../../modules/admin/services/admin-nooks.service';
import { supabaseAdmin } from '../../database/supabase.client';
import { createMockSupabaseClient, createMockQueryChain, createMockConfigService } from '../helpers/mock-supabase';

describe('AdminNooksService', () => {
  let service: AdminNooksService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };
    service = new AdminNooksService(createMockConfigService() as any, mockAdminUsers as any);
  });

  describe('listNooks', () => {
    it.skip('should return paginated nooks', async () => {
      const chain = createMockQueryChain({
        data: [{ id: 'n1', title: 'Test Nook', is_active: true }],
        error: null, count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listNooks({} as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listNooks({} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNook', () => {
    it.skip('should create nook', async () => {
      const existsChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'n1', title: 'New Nook' }, error: null });
      const memberChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(memberChain)
        .mockReturnValueOnce(logChain);

      const result = await service.createNook('admin-1', { name: 'New Nook', description: 'desc' } as any);
      expect(result.success).toBe(true);
    });

    it('should throw if name exists', async () => {
      const chain = createMockQueryChain({ data: { id: 'existing' }, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.createNook('admin-1', { name: 'Existing' } as any)).rejects.toThrow();
    });
  });

  describe('updateNook', () => {
    it.skip('should update nook', async () => {
      const updateChain = createMockQueryChain({ data: { id: 'n1' }, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from.mockReturnValueOnce(updateChain).mockReturnValueOnce(logChain);

      const result = await service.updateNook('n1', 'admin-1', { title: 'Updated' } as any);
      expect(result.success).toBe(true);
    });
  });

  describe('deleteNook', () => {
    it.skip('should delete nook', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from.mockReturnValueOnce(deleteChain).mockReturnValueOnce(logChain);

      const result = await service.deleteNook('n1', 'admin-1');
      expect(result.success).toBe(true);
    });
  });

  describe('removeNookMember', () => {
    it.skip('should remove member from nook', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const updateChain = createMockQueryChain({ data: null, error: null });
      const logChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(logChain);

      const result = await service.removeNookMember('n1', 'u1', 'admin-1');
      expect(result.success).toBe(true);
    });
  });
});
