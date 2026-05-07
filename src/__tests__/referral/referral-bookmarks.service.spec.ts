import { BadRequestException } from '@nestjs/common';
import { ReferralBookmarksService } from '../../modules/referral/services/referral-bookmarks.service';
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
jest.mock('../../common/utils/logger.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ReferralBookmarksService', () => {
  let service: ReferralBookmarksService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new ReferralBookmarksService(createMockConfigService() as any);
  });

  describe('bookmarkReferral', () => {
    it('should bookmark successfully', async () => {
      const insertChain = createMockQueryChain({ data: null, error: null });
      const postChain = createMockQueryChain({
        data: { bookmarks_count: 3 },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(postChain);
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.bookmarkReferral('u1', 'ref-1');
      expect(result.success).toBe(true);
      expect(result.data.bookmarked).toBe(true);
      expect(result.data.bookmarksCount).toBe(3);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.bookmarkReferral('u1', 'ref-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('removeBookmark', () => {
    it('should remove bookmark', async () => {
      const deleteChain = createMockQueryChain({ data: null, error: null });
      const postChain = createMockQueryChain({
        data: { bookmarks_count: 2 },
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(postChain);
      mockClient.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.removeBookmark('u1', 'ref-1');
      expect(result.success).toBe(true);
      expect(result.data.bookmarked).toBe(false);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.removeBookmark('u1', 'ref-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getUserBookmarks', () => {
    it('should return bookmarks', async () => {
      const chain = createMockQueryChain({
        data: [{ referral_post_id: 'ref-1', created_at: '2026-01-01' }],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);
      const result = await service.getUserBookmarks('u1');
      expect(result.success).toBe(true);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
      });
      mockClient.from.mockReturnValueOnce(chain);
      await expect(service.getUserBookmarks('u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
