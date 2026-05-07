import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MentorshipBookmarksService } from '../../modules/mentorship/services/mentorship-bookmarks.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

describe('MentorshipBookmarksService', () => {
  let service: MentorshipBookmarksService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new MentorshipBookmarksService(createMockConfigService() as any);
  });

  describe('createBookmark', () => {
    it('should create bookmark', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: {
          id: 'u2',
          has_completed_onboarding: true,
          is_deleted: false,
          is_deactivated: false,
        },
        error: null,
      });
      const upsertChain = createMockQueryChain({
        data: { id: 'bm-1', user_id: 'u1', bookmarked_user_id: 'u2' },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(upsertChain);

      const result = await service.createBookmark('u1', {
        bookmarkedUserId: 'u2',
      });
      expect(result.message).toBeDefined();
      expect(result.bookmark).toBeDefined();
    });

    it('should throw if user not found', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'not found', code: 'PGRST116' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(
        service.createBookmark('bad', { bookmarkedUserId: 'u2' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if target user deleted', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: {
          id: 'u2',
          has_completed_onboarding: true,
          is_deleted: true,
          is_deactivated: false,
        },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(targetChain);
      await expect(
        service.createBookmark('u1', { bookmarkedUserId: 'u2' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if already bookmarked (upsert returns null)', async () => {
      const userChain = createMockQueryChain({
        data: { id: 'u1' },
        error: null,
      });
      const targetChain = createMockQueryChain({
        data: {
          id: 'u2',
          has_completed_onboarding: true,
          is_deleted: false,
          is_deactivated: false,
        },
        error: null,
      });
      const upsertChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(targetChain)
        .mockReturnValueOnce(upsertChain);
      await expect(
        service.createBookmark('u1', { bookmarkedUserId: 'u2' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBookmarks', () => {
    it('should return bookmarks', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            id: 'bm-1',
            notes: 'test',
            created_at: '2026-01-01',
            bookmarked_user: { id: 'u2', username: 'Test' },
          },
        ],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getBookmarks('u1');
      expect(result).toHaveLength(1);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.getBookmarks('u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteBookmark', () => {
    it('should delete bookmark', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.deleteBookmark('u1', 'u2');
      expect(result.message).toBeDefined();
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.deleteBookmark('u1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateBookmark', () => {
    it('should update notes', async () => {
      const chain = createMockQueryChain({
        data: { id: 'bm-1', notes: 'updated' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.updateBookmark('u1', 'u2', 'updated notes');
      expect(result.message).toBeDefined();
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.updateBookmark('u1', 'u2', 'notes')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
