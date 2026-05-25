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

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NooksService } from '../../modules/nooks/services/nooks.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';
import { MSG } from '../../common/constants/messages';

describe('NooksService', () => {
  let service: NooksService;
  let mockClient: any;
  let mockRedis: any;

  const mockNook = {
    id: 'nook-1',
    title: 'Test Nook',
    description: 'desc',
    urgency: 'medium',
    scope: 'global',
    hashtags: ['tech'],
    creator_id: 'u1',
    members_count: 1,
    messages_count: 0,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    created_at: '2026-05-01',
    is_active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn(),
      delPattern: jest.fn(),
    };

    const mockIdentityReveal = {
      getRevealedUserIds: jest.fn().mockResolvedValue([]),
    };
    const mockEncryption = {
      encrypt: jest.fn((v) => v + '_enc'),
      decrypt: jest.fn((v) => v + '_dec'),
    };
    const mockOkestra = {
      generateNookSuggestions: jest.fn().mockResolvedValue([]),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const mockContentSafety = {
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getHiddenContentIds: jest.fn().mockResolvedValue([]),
    };

    const mockModerationQueue = { add: jest.fn().mockResolvedValue({}) };

    service = new NooksService(
      createMockConfigService() as any,
      mockRedis,
      mockIdentityReveal,
      mockEncryption,
      mockOkestra,
      mockContentSafety as any,
      mockModerationQueue as any,
    );
  });

  describe('create', () => {
    it('should create a nook and auto-join creator', async () => {
      const insertChain = createMockQueryChain({ data: mockNook, error: null });
      const memberChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(memberChain);

      const result = await service.create(
        { title: 'Test Nook', description: 'desc' } as any,
        'u1',
      );
      expect(result.success).toBe(true);
      expect(result.data.nook.title).toBe('Test Nook');
      expect(result.message).toBe(MSG.NOOK.CREATED);
    });

    it('should throw on insert error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'insert failed' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(
        service.create({ title: 'Test' } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return cached nooks if available', async () => {
      const cached = { success: true, data: { nooks: [mockNook] } };
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.findAll({} as any, 'u2');
      expect(result).toEqual(cached);
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('should query and cache nooks', async () => {
      const chain = createMockQueryChain({
        data: [mockNook],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAll({} as any, 'u2');
      expect(result.success).toBe(true);
      expect(result.data.nooks).toHaveLength(1);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should throw on query error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'query failed' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findAll({} as any, 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should apply urgency filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAll({ urgency: 'high' } as any, 'u2');
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('urgency', 'high');
    });

    it('should apply scope filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAll({ scope: 'local' } as any, 'u2');
      expect(result.success).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('scope', 'local');
    });

    it('should apply hashtag filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAll({ hashtag: 'tech' } as any, 'u2');
      expect(result.success).toBe(true);
      expect(chain.contains).toHaveBeenCalledWith('hashtags', ['tech']);
    });

    it('should apply trending sort', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValue(chain);

      const result = await service.findAll({ sortBy: 'trending' } as any, 'u2');
      expect(result.success).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should return nook by ID', async () => {
      const nookChain = createMockQueryChain({ data: mockNook, error: null });
      const viewChain = createMockQueryChain({ data: null, error: null });
      const memberChain = createMockQueryChain({
        data: [{ user_id: 'u1' }],
        error: null,
        count: 1,
      });
      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(viewChain)
        .mockReturnValueOnce(memberChain);

      const result = await service.findOne('nook-1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw if nook not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findOne('nope', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if nook expired', async () => {
      const expiredNook = {
        ...mockNook,
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      };
      const chain = createMockQueryChain({ data: expiredNook, error: null });
      mockClient.from.mockReturnValue(chain);

      await expect(service.findOne('nook-1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should delete nook', async () => {
      const fetchChain = createMockQueryChain({
        data: { creator_id: 'u1' },
        error: null,
      });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.remove('nook-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(MSG.NOOK.DELETED);
    });

    it('should throw if nook not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValue(chain);

      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('lock', () => {
    it('should lock nook', async () => {
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(updateChain);

      const result = await service.lock('nook-1', 'test reason');
      expect(result.success).toBe(true);
    });
  });

  describe('getGlobalStats', () => {
    it('should return nook stats', async () => {
      const chain = createMockQueryChain({
        data: [{ user_id: 'u1' }],
        error: null,
        count: 5,
      });
      mockClient.from.mockReturnValue(chain);

      const result = await service.getGlobalStats();
      expect(result.success).toBe(true);
      expect(result.data.activeNooks).toBeDefined();
    });

    it('should return cached stats if available', async () => {
      const cached = { success: true, data: { activeNooks: 10 } };
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await service.getGlobalStats();
      expect(result).toEqual(cached);
      expect(mockClient.from).not.toHaveBeenCalled();
    });
  });

  describe('flagMessage', () => {
    it('should flag a message', async () => {
      const fetchChain = createMockQueryChain({
        data: { flagged_count: 2 },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.flagMessage('nook-1', 'msg-1', 'spam', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw if message not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.flagMessage('nook-1', 'bad-msg', 'spam', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw on update error', async () => {
      const fetchChain = createMockQueryChain({ data: { flagged_count: 0 }, error: null });
      const updateChain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      await expect(service.flagMessage('nook-1', 'msg-1', 'spam', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyNooks', () => {
    it('should return nooks created by user', async () => {
      const chain = createMockQueryChain({
        data: [{ ...mockNook }],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getMyNooks('u1');
      expect(result.success).toBe(true);
      expect(result.data.nooks).toHaveLength(1);
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getMyNooks('u1')).rejects.toThrow(BadRequestException);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getMyNooks('u1', 1, 8);
      expect(result.data.pagination.total).toBe(0);
    });
  });

  describe('getBookmarkedNooks', () => {
    it('should return empty when no bookmarks', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getBookmarkedNooks('u1');
      expect(result.success).toBe(true);
      expect(result.data.nooks).toHaveLength(0);
    });

    it('should return bookmarked nooks', async () => {
      const bookmarksChain = createMockQueryChain({
        data: [{ content_id: 'nook-1' }],
        error: null,
      });
      const nooksChain = createMockQueryChain({
        data: [{ ...mockNook }],
        error: null,
        count: 1,
      });
      mockClient.from
        .mockReturnValueOnce(bookmarksChain)
        .mockReturnValueOnce(nooksChain);

      const result = await service.getBookmarkedNooks('u1');
      expect(result.success).toBe(true);
      expect(result.data.nooks).toHaveLength(1);
    });

    it('should throw on bookmarks DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getBookmarkedNooks('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update nook title successfully', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: null, is_hidden: false, is_locked: false },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: { ...mockNook, title: 'Updated Nook', is_edited: true },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.update('nook-1', 'u1', { title: 'Updated Nook' });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Nook updated successfully');
    });

    it('should throw NotFoundException when nook not found', async () => {
      const fetchChain = createMockQueryChain({
        data: null,
        error: { message: 'not found' },
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nope', 'u1', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not creator', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'other-user', deleted_at: null, is_hidden: false, is_locked: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', { title: 'New' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when nook has deleted_at', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: '2026-01-01', is_hidden: false, is_locked: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when nook is_hidden', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: null, is_hidden: true, is_locked: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', { title: 'New' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when nook is_locked', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: null, is_hidden: false, is_locked: true },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', { title: 'New' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when no fields provided', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: null, is_hidden: false, is_locked: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate urgency enum (only high/medium/low)', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: null, is_hidden: false, is_locked: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', { urgency: 'critical' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate scope enum (only global/company)', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'nook-1', creator_id: 'u1', deleted_at: null, is_hidden: false, is_locked: false },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(fetchChain);

      await expect(
        service.update('nook-1', 'u1', { scope: 'local' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleNookBookmark', () => {
    it('should add bookmark when not already bookmarked', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'nook-1' }, error: null });
      const existingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(insertChain);

      const result = await service.toggleNookBookmark('nook-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.bookmarked).toBe(true);
    });

    it('should remove bookmark when already bookmarked', async () => {
      const nookChain = createMockQueryChain({ data: { id: 'nook-1' }, error: null });
      const existingChain = createMockQueryChain({ data: { id: 'bm-1' }, error: null });
      const deleteChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(nookChain)
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(deleteChain);

      const result = await service.toggleNookBookmark('nook-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.bookmarked).toBe(false);
    });

    it('should throw if nook not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.toggleNookBookmark('bad-nook', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});
