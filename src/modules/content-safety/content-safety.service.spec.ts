import { ConflictException, BadRequestException } from '@nestjs/common';
import { ContentSafetyService } from './content-safety.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../../__tests__/helpers/mock-supabase';

jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
  supabaseClient: jest.fn(),
}));

jest.spyOn(console, 'log').mockImplementation(() => {});

describe('ContentSafetyService', () => {
  let service: ContentSafetyService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new ContentSafetyService(createMockConfigService() as any);
  });

  describe('flagContent', () => {
    const reporterId = 'user-1';
    const contentType = 'post';
    const contentId = 'post-1';
    const dto = { reason: 'Harassment' as const, description: 'test' };

    it('should flag content successfully', async () => {
      const checkChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'flag-1', content_type: 'post', content_id: 'post-1', reason: 'Harassment', status: 'pending' }, error: null });
      const countChain = createMockQueryChain({ data: null, error: null, count: 1 });

      mockClient.from
        .mockReturnValueOnce(checkChain)   // duplicate check
        .mockReturnValueOnce(insertChain)  // insert
        .mockReturnValueOnce(countChain);  // count check

      const result = await service.flagContent(reporterId, contentType, contentId, dto);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('flag-1');
    });

    it('should throw ConflictException if duplicate', async () => {
      const checkChain = createMockQueryChain({ data: { id: 'existing' }, error: null });
      mockClient.from.mockReturnValueOnce(checkChain);

      await expect(service.flagContent(reporterId, contentType, contentId, dto))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException on insert error', async () => {
      const checkChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: { message: 'insert failed' } });
      mockClient.from.mockReturnValueOnce(checkChain).mockReturnValueOnce(insertChain);

      await expect(service.flagContent(reporterId, contentType, contentId, dto))
        .rejects.toThrow(BadRequestException);
    });

    it('should auto-hide content when 3+ flags', async () => {
      const checkChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: { id: 'flag-1', status: 'pending' }, error: null });
      const countChain = createMockQueryChain({ data: null, error: null, count: 3 });
      const updateChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(updateChain); // autoHideContent

      const result = await service.flagContent(reporterId, contentType, contentId, dto);
      expect(result.success).toBe(true);
      expect(mockClient.from).toHaveBeenCalledWith('feed_posts'); // autoHide targets feed_posts for 'post'
    });
  });

  describe('hideContent', () => {
    it('should hide content successfully', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.hideContent('user-1', 'post', 'post-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Content hidden');
    });

    it('should throw on upsert error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.hideContent('user-1', 'post', 'post-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getHiddenContentIds', () => {
    it('should return content IDs', async () => {
      const chain = createMockQueryChain({ data: [{ content_id: 'a' }, { content_id: 'b' }], error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const ids = await service.getHiddenContentIds('user-1', 'post');
      expect(ids).toEqual(['a', 'b']);
    });

    it('should return empty array on error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      const ids = await service.getHiddenContentIds('user-1', 'post');
      expect(ids).toEqual([]);
    });
  });

  describe('getBlockedUserIds', () => {
    it('should return IDs from both directions', async () => {
      const byMe = createMockQueryChain({ data: [{ blocked_id: 'u2' }], error: null });
      const byThem = createMockQueryChain({ data: [{ blocker_id: 'u3' }], error: null });
      mockClient.from.mockReturnValueOnce(byMe).mockReturnValueOnce(byThem);

      const ids = await service.getBlockedUserIds('u1');
      expect(ids).toContain('u2');
      expect(ids).toContain('u3');
    });

    it('should return empty when no blocks', async () => {
      const empty = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValueOnce(empty).mockReturnValueOnce(empty);

      const ids = await service.getBlockedUserIds('u1');
      expect(ids).toEqual([]);
    });
  });

  describe('getFlags', () => {
    it('should return paginated flags with profiles', async () => {
      const flagsChain = createMockQueryChain({
        data: [{ id: 'f1', reporter_id: 'u1', reviewed_by: null, status: 'pending' }],
        error: null,
        count: 1,
      });
      const usersChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'TestUser', avatar: '🔥' }],
        error: null,
      });
      mockClient.from.mockReturnValueOnce(flagsChain).mockReturnValueOnce(usersChain);

      const result = await service.getFlags({ page: 1, limit: 20 });
      expect(result.success).toBe(true);
      expect(result.data[0].reporter.username).toBe('TestUser');
      expect(result.pagination.total).toBe(1);
    });

    it('should throw on error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' }, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getFlags({ page: 1, limit: 20 }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewFlag', () => {
    it('should update flag status', async () => {
      const chain = createMockQueryChain({ data: { id: 'f1', status: 'actioned' }, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.reviewFlag('f1', 'actioned', 'admin-1');
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('actioned');
    });

    it('should throw on invalid status', async () => {
      await expect(service.reviewFlag('f1', 'invalid', 'admin-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw on update error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.reviewFlag('f1', 'reviewed', 'admin-1'))
        .rejects.toThrow(BadRequestException);
    });
  });
});
