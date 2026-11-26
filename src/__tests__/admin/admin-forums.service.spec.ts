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

import { BadRequestException, ConflictException } from '@nestjs/common';
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
      // createForum: 1) check the name 2) read the last sort order 3) insert 4) logAction (mocked)
      const existsChain = createMockQueryChain({ data: [], error: null });
      const insertChain = createMockQueryChain({
        data: { id: 'f1', name: 'New Forum' },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(existsChain)
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
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

    it('should throw if name already exists in the space', async () => {
      const chain = createMockQueryChain({
        data: [{ id: 'existing' }],
        error: null,
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.createForum('admin-1', 'AdminUser', {
          name: 'Existing',
          scope: 'company',
          company_name: 'Google',
        }),
      ).rejects.toThrow(ConflictException);
      expect(chain.eq).toHaveBeenCalledWith('company_name', 'Google');
      expect(chain.ilike).toHaveBeenCalledWith('name', 'Existing');
    });

    it('creates a Students forum and a Shared forum in their own spaces', async () => {
      const insert = createMockQueryChain({ data: { id: 'f2' }, error: null });
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ sort_order: 7 }], error: null }))
        .mockReturnValueOnce(insert);
      await service.createForum('admin-1', 'AdminUser', { name: ' Night Owls ', scope: 'students' });
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Night Owls', company_name: 'Students', is_global: false, is_shared: false, sort_order: 8 }),
      );

      const shared = createMockQueryChain({ data: { id: 'f3' }, error: null });
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(shared);
      await service.createForum('admin-1', 'AdminUser', { name: 'Grief', scope: 'shared' });
      expect(shared.insert).toHaveBeenCalledWith(
        expect.objectContaining({ company_name: null, is_global: true, is_shared: true, sort_order: 1 }),
      );
    });

    it('refuses a reserved space name', async () => {
      await expect(
        service.createForum('admin-1', 'AdminUser', { name: 'X', scope: 'company', company_name: 'other companies' }),
      ).rejects.toThrow(BadRequestException);
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
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'f1' }, error: null }))
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

  describe('Other topics', () => {
    const otherTopics = () =>
      createMockQueryChain({ data: { id: 'ot', is_other_topics: true }, error: null });

    it("can't be renamed, hidden or deleted", async () => {
      mockClient.from.mockReturnValue(otherTopics());
      await expect(service.updateForum('a', 'A', 'ot', { name: 'Misc' })).rejects.toThrow(ConflictException);
      await expect(service.updateForum('a', 'A', 'ot', { is_hidden: true })).rejects.toThrow(ConflictException);
      await expect(service.deleteForum('a', 'A', 'ot', 'r')).rejects.toThrow(ConflictException);
    });

    it('accepts its own unchanged name, as the edit form sends it', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'ot', name: 'Other topics', is_other_topics: true }, error: null }))
        .mockReturnValue(createMockQueryChain({ data: { id: 'ot' }, error: null }));
      const result = await service.updateForum('a', 'A', 'ot', { name: 'Other topics', is_locked: true, is_hidden: false });
      expect(result.success).toBe(true);
    });

    it('takes only true or false for hidden and locked', async () => {
      await expect(service.updateForum('a', 'A', 'ot', { is_hidden: 'true' })).rejects.toThrow(BadRequestException);
      await expect(service.updateForum('a', 'A', 'ot', { is_locked: 1 })).rejects.toThrow(BadRequestException);
    });

    it('can still be locked', async () => {
      mockClient.from
        .mockReturnValueOnce(otherTopics())
        .mockReturnValue(createMockQueryChain({ data: { id: 'ot' }, error: null }));
      const result = await service.updateForum('a', 'A', 'ot', { is_locked: true });
      expect(result.success).toBe(true);
    });
  });

  describe('reorderForums', () => {
    it('sets the order and logs it', async () => {
      const check = createMockQueryChain({ data: [{ id: 'a' }, { id: 'b' }], error: null });
      const update = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(check).mockReturnValue(update);

      await service.reorderForums('admin-1', 'A', { space: 'Students', forum_ids: ['b', 'a'] });

      expect(check.eq).toHaveBeenCalledWith('company_name', 'Students');
      expect(update.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ sort_order: 1 }));
      expect(update.eq).toHaveBeenNthCalledWith(1, 'id', 'b');
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'A', 'reorder_forums', 'forum', 'b', undefined,
        expect.objectContaining({ space: 'Students' }), undefined,
      );
    });

    it('refuses a forum from another space', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'a' }], error: null }));
      await expect(
        service.reorderForums('admin-1', 'A', { space: 'Students', forum_ids: ['a', 'x'] }),
      ).rejects.toThrow('Every forum must be in the space being ordered');
    });

    it('refuses repeated ids', async () => {
      await expect(
        service.reorderForums('admin-1', 'A', { forum_ids: ['a', 'a'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('labels', () => {
    it('counts labels ignoring case', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'ot' }, error: null }))
        .mockReturnValueOnce(
          createMockQueryChain({
            data: [{ label: 'Visas' }, { label: 'visas' }, { label: 'Rent' }],
            error: null,
          }),
        );
      const result = await service.topLabels('Students');
      expect(result.data).toEqual([
        { label: 'Visas', topics: 2 },
        { label: 'Rent', topics: 1 },
      ]);
    });

    it("makes a label a forum and moves the label's topics", async () => {
      const move = createMockQueryChain({ data: [{ id: 't1' }, { id: 't2' }], error: null });
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'ot' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'new' }, error: null }))
        .mockReturnValueOnce(move)
        .mockReturnValue(createMockQueryChain({ data: null, error: null, count: 2 }));

      const result = await service.promoteLabel('admin-1', 'A', { space: 'Students', label: ' Visas ' });

      expect(move.update).toHaveBeenCalledWith({ forum_id: 'new' });
      expect(move.eq).toHaveBeenCalledWith('forum_id', 'ot');
      expect(move.ilike).toHaveBeenCalledWith('label', 'Visas');
      expect(result.data.topics_moved).toBe(2);
    });
  });
});
