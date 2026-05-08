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
import { AdminForumsService } from '../../modules/admin/services/admin-forums.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminForumsService', () => {
  let service: AdminForumsService;
  let mockClient: any;
  const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminForumsService(
      createMockConfigService() as any,
      mockAdminUsers as any,
    );
  });

  describe('listForums', () => {
    it('should return paginated forums', async () => {
      // listForums: 1) from('forums').select(...)
      // Then per forum: 2) from('forum_topics').select(...) for posts_this_week
      // moderators is empty so no user_profiles query
      const forumsChain = createMockQueryChain({
        data: [
          {
            id: 'f1',
            name: 'Tech Forum',
            description: 'desc',
            moderators: [],
            topic_count: 5,
            member_count: 10,
            is_global: true,
            created_at: '2026-01-01',
          },
        ],
        error: null,
        count: 1,
      });
      const postsWeekChain = createMockQueryChain({
        data: null,
        error: null,
        count: 3,
      });

      mockClient.from
        .mockReturnValueOnce(forumsChain) // forums query
        .mockReturnValueOnce(postsWeekChain); // forum_topics count

      const result = await service.listForums({} as any);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Tech Forum');
      expect(result.data[0].scope).toBe('global');
      expect(result.data[0].posts_this_week).toBe(3);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.listForums({} as any);
      expect(result.data).toEqual([]);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.listForums({} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createForum', () => {
    it('should create forum', async () => {
      // createForum: 1) check existing name 2) insert 3) logAction (mocked)
      const existsChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'f1', name: 'New Forum' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.createForum(
        'admin-1',
        'AdminUser',
        { name: 'New Forum', description: 'desc', scope: 'global' },
        '127.0.0.1',
      );
      expect(result.success).toBe(true);
    });

    it('should throw if name is missing', async () => {
      await expect(
        service.createForum('admin-1', 'AdminUser', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if name already exists', async () => {
      const chain = createMockQueryChain({
        data: { id: 'existing' },
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createForum('admin-1', 'AdminUser', {
          name: 'Existing',
          scope: 'global',
        }),
      ).rejects.toThrow();
    });
  });

  describe('updateForum', () => {
    it('should update forum', async () => {
      // updateForum: 1) update forums 2) logAction (mocked)
      const updateChain = createMockQueryChain({
        data: { id: 'f1', name: 'Updated' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(updateChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.updateForum('admin-1', 'AdminUser', 'f1', {
        name: 'Updated',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deleteForum', () => {
    it('should delete forum', async () => {
      // deleteForum: 1) update forums (soft delete) 2) logAction (mocked)
      const deleteChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValue(createMockQueryChain({ data: null, error: null }));

      const result = await service.deleteForum(
        'admin-1',
        'AdminUser',
        'f1',
        'Not needed anymore',
      );
      expect(result).toBeNull();
    });
  });
});
