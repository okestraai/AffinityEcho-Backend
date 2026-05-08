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

import { BadRequestException } from '@nestjs/common';
import { AdminNooksService } from '../../modules/admin/services/admin-nooks.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminNooksService', () => {
  let service: AdminNooksService;
  let mockClient: any;
  const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminNooksService(
      createMockConfigService() as any,
      mockAdminUsers as any,
    );
  });

  describe('listNooks', () => {
    it('should return paginated nooks', async () => {
      // listNooks: 1) from('nooks').select(...)
      // Then per nook: from('nook_members').select(count), from('nook_messages').select(count)
      const nooksChain = createMockQueryChain({
        data: [
          {
            id: 'n1',
            title: 'Tech Nook',
            description: 'desc',
            scope: 'global',
            is_active: true,
            is_locked: false,
            creator_id: 'u1',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            created_at: '2026-01-01',
          },
        ],
        error: null,
        count: 1,
      });
      // Default for sub-queries (member count, message count)
      const countChain = createMockQueryChain({
        data: null,
        error: null,
        count: 5,
      });

      mockClient.from
        .mockReturnValueOnce(nooksChain)
        .mockReturnValue(countChain);

      const result = await service.listNooks({});
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listNooks({});
      expect(result.data.items).toEqual([]);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listNooks({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNook', () => {
    it('should create nook', async () => {
      // 1) check existing name 2) insert 3) logAction (mocked)
      const existsChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'n1', title: 'New Nook' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.createNook('admin-1', 'AdminUser', {
        name: 'New Nook',
        description: 'desc',
        scope: 'global',
      });
      expect(result.success).toBe(true);
    });

    it('should throw if name is missing', async () => {
      await expect(
        service.createNook('admin-1', 'AdminUser', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if name already exists', async () => {
      const chain = createMockQueryChain({
        data: { id: 'existing' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createNook('admin-1', 'AdminUser', { name: 'Existing' }),
      ).rejects.toThrow();
    });
  });

  describe('updateNook', () => {
    it('should update nook', async () => {
      const updateChain = createMockQueryChain({
        data: { id: 'n1', title: 'Updated' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.updateNook('admin-1', 'AdminUser', 'n1', {
        name: 'Updated',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deleteNook', () => {
    it('should delete nook', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.deleteNook(
        'admin-1',
        'AdminUser',
        'admin',
        'n1',
        'Cleanup',
      );
      expect(result).toBeNull();
    });

    it('should throw if not admin role', async () => {
      await expect(
        service.deleteNook('admin-1', 'AdminUser', 'user', 'n1', 'Nope'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('should remove member from nook', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.removeMember(
        'admin-1',
        'AdminUser',
        'n1',
        'u2',
        'Violation',
      );
      expect(result.success).toBe(true);
    });
  });
});
