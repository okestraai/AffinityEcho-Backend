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
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn(),
  })),
);

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminModerationService } from '../../modules/admin/services/admin-moderation.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('AdminModerationService', () => {
  let service: AdminModerationService;
  let mockClient: any;
  const mockAdminUsers = { logAction: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    service = new AdminModerationService(
      createMockConfigService() as any,
      mockAdminUsers as any,
      { delPattern: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  // ─── listContent ────────────────────────────────────────────

  describe('listContent', () => {
    it('should return paginated content with default empty query', async () => {
      const chain = createMockQueryChain({
        data: [
          {
            content_type: 'feed_post',
            content_id: 'p1',
            moderation_status: 'active',
            moderated_by: null,
          },
        ],
        error: null,
        count: 1,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listContent({} as any);
      expect(result.success).toBe(true);
    });

    it('should handle DB errors gracefully and return empty for failed types', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'fail' },
        count: null,
      });
      mockClient.from.mockReturnValue(chain);
      const result = await service.listContent({} as any);
      expect(result.success).toBe(true);
      expect(result.data.items).toEqual([]);
    });

    it('should return items for a specific content type with 3 from() calls', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Hello world', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'user-1', username: 'testuser', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].type).toBe('feed_post');
      expect(result.data.items[0].content_id).toBe('post-1');
      expect(result.data.items[0].author.username).toBe('testuser');
      expect(result.data.summary.total).toBe(1);
      expect(result.data.summary.visible).toBe(1);
      expect(result.data.summary.active).toBe(1);
    });

    it('should apply status=hidden filter via eq on source query', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Hidden post', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: true, hidden_by: 'admin-1', hidden_at: '2025-01-02', hidden_reason: 'spam',
        },
      ];
      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [
          { id: 'user-1', username: 'testuser', avatar: null, is_company_verified: false },
          { id: 'admin-1', username: 'admin', avatar: null, is_company_verified: false },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post', status: 'hidden' });

      expect(result.success).toBe(true);
      expect(sourceChain.eq).toHaveBeenCalledWith('is_hidden', true);
      expect(result.data.items[0].moderation_status).toBe('hidden');
      expect(result.data.summary.hidden).toBe(1);
    });

    it('should apply status=visible filter via eq on source query', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Visible post', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'user-1', username: 'user1', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post', status: 'visible' });

      expect(sourceChain.eq).toHaveBeenCalledWith('is_hidden', false);
      expect(result.data.summary.visible).toBe(1);
    });

    it('should filter by flagged=true keeping only items with reports_count > 0', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Reported', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        {
          id: 'post-2', content: 'Normal', user_id: 'u1',
          created_at: '2025-01-02', updated_at: '2025-01-02',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        {
          id: 'mod-1', content_id: 'post-1', moderation_status: 'visible',
          moderation_reason: null, reports_count: 3, moderated_by: null, moderated_at: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'user1', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post', flagged: 'true' });

      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].content_id).toBe('post-1');
      expect(result.data.summary.flagged).toBe(1);
    });

    it('should sort by reports_count descending', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Low', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        {
          id: 'post-2', content: 'High', user_id: 'u1',
          created_at: '2025-01-02', updated_at: '2025-01-02',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        { id: 'm1', content_id: 'post-1', moderation_status: 'visible', moderation_reason: null, reports_count: 1, moderated_by: null, moderated_at: null },
        { id: 'm2', content_id: 'post-2', moderation_status: 'visible', moderation_reason: null, reports_count: 10, moderated_by: null, moderated_at: null },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({
        type: 'feed_post', sortBy: 'reports_count', sortOrder: 'desc',
      });

      expect(result.data.items[0].reports_count).toBe(10);
      expect(result.data.items[1].reports_count).toBe(1);
    });

    it('should sort by reports_count ascending', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'A', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        {
          id: 'post-2', content: 'B', user_id: 'u1',
          created_at: '2025-01-02', updated_at: '2025-01-02',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        { id: 'm1', content_id: 'post-1', moderation_status: 'visible', moderation_reason: null, reports_count: 5, moderated_by: null, moderated_at: null },
        { id: 'm2', content_id: 'post-2', moderation_status: 'visible', moderation_reason: null, reports_count: 1, moderated_by: null, moderated_at: null },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({
        type: 'feed_post', sortBy: 'reports_count', sortOrder: 'asc',
      });

      expect(result.data.items[0].reports_count).toBe(1);
      expect(result.data.items[1].reports_count).toBe(5);
    });

    it('should map moderator info from moderation data', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Moderated', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        {
          id: 'mod-1', content_id: 'post-1', moderation_status: 'hidden',
          moderation_reason: 'spam', reports_count: 2,
          moderated_by: 'admin-1', moderated_at: '2025-01-02',
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [
          { id: 'user-1', username: 'author', avatar: null, is_company_verified: false },
          { id: 'admin-1', username: 'moderator', avatar: null, is_company_verified: true },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.data.items[0].moderated_by.username).toBe('moderator');
      expect(result.data.items[0].moderation_status).toBe('hidden');
      expect(result.data.items[0].reports_count).toBe(2);
    });

    it('should use is_hidden fallback when no moderation record exists', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Hidden no mod', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: true, hidden_by: 'admin-1', hidden_at: '2025-01-02', hidden_reason: 'bad',
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [
          { id: 'u1', username: 'u', avatar: null, is_company_verified: false },
          { id: 'admin-1', username: 'admin', avatar: null, is_company_verified: false },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.data.items[0].moderation_status).toBe('hidden');
      expect(result.data.items[0].moderation_reason).toBe('bad');
      expect(result.data.items[0].moderated_by.username).toBe('admin');
    });

    it('should handle content with null author', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Orphan', user_id: null,
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.data.items[0].author).toBeNull();
    });

    it('should paginate results correctly', async () => {
      const sourceData = Array.from({ length: 5 }, (_, i) => ({
        id: `post-${i}`, content: `Content ${i}`, user_id: 'u1',
        created_at: `2025-01-0${i + 1}`, updated_at: `2025-01-0${i + 1}`,
        is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
      }));

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post', page: '1', limit: '2' });

      expect(result.data.items).toHaveLength(2);
      expect(result.meta.total).toBe(5);
    });

    it('should truncate preview to 200 characters', async () => {
      const longContent = 'A'.repeat(300);
      const sourceData = [
        {
          id: 'post-1', content: longContent, user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.data.items[0].preview).toHaveLength(200);
      expect(result.data.items[0].full_content).toHaveLength(300);
    });

    it('should handle null content value gracefully', async () => {
      const sourceData = [
        {
          id: 'post-1', content: null, user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.data.items[0].preview).toBeNull();
      expect(result.data.items[0].full_content).toBeNull();
    });

    it('should query all 6 content types when no type filter is provided', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(emptyChain);

      await service.listContent({});

      expect(mockClient.from).toHaveBeenCalledWith('feed_posts');
      expect(mockClient.from).toHaveBeenCalledWith('feed_comments');
      expect(mockClient.from).toHaveBeenCalledWith('forum_topics');
      expect(mockClient.from).toHaveBeenCalledWith('forum_comments');
      expect(mockClient.from).toHaveBeenCalledWith('nooks');
      expect(mockClient.from).toHaveBeenCalledWith('nook_messages');
    });

    it('should compute summary counts for removed status', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Removed', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: true, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        {
          id: 'mod-1', content_id: 'post-1', moderation_status: 'removed',
          moderation_reason: 'violation', reports_count: 0, moderated_by: null, moderated_at: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.listContent({ type: 'feed_post' });

      expect(result.data.summary.removed).toBe(1);
      expect(result.data.summary.visible).toBe(0);
    });
  });

  // ─── getContentDetail ───────────────────────────────────────

  describe('getContentDetail', () => {
    it('should throw BadRequestException for invalid content type', async () => {
      await expect(
        service.getContentDetail('invalid_type', 'some-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when content not found (null data)', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValue(chain);
      await expect(
        service.getContentDetail('feed_post', 'nope'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when source query has error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { code: 'PGRST116' },
      });
      mockClient.from.mockReturnValue(chain);
      await expect(
        service.getContentDetail('feed_post', 'nope'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return content detail without moderator (3 from() calls)', async () => {
      const sourceChain = createMockQueryChain({
        data: {
          id: 'post-1', content: 'Hello', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        error: null,
      });
      const authorChain = createMockQueryChain({
        data: { id: 'user-1', username: 'author', avatar: null, email: 'a@b.com', is_company_verified: false },
        error: null,
      });
      const modChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(sourceChain)   // source table
        .mockReturnValueOnce(authorChain)   // user_profiles (author)
        .mockReturnValueOnce(modChain);     // content_moderation

      const result = await service.getContentDetail('feed_post', 'post-1');

      expect(result.success).toBe(true);
      expect(result.data.content_id).toBe('post-1');
      expect(result.data.type).toBe('feed_post');
      expect(result.data.author.username).toBe('author');
      expect(result.data.moderated_by).toBeNull();
      expect(result.data.moderation_status).toBe('visible');
      expect(result.data.reports_count).toBe(0);
    });

    it('should return content detail with moderator info (4 from() calls)', async () => {
      const sourceChain = createMockQueryChain({
        data: {
          id: 'post-1', content: 'Bad content', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: true, hidden_by: 'admin-1', hidden_at: '2025-01-02', hidden_reason: 'spam',
        },
        error: null,
      });
      const authorChain = createMockQueryChain({
        data: { id: 'user-1', username: 'author', avatar: null, email: 'a@b.com', is_company_verified: false },
        error: null,
      });
      const modChain = createMockQueryChain({
        data: {
          id: 'mod-1', moderation_status: 'hidden', moderation_reason: 'spam',
          reports_count: 5, moderated_by: 'admin-1', moderated_at: '2025-01-02',
        },
        error: null,
      });
      const moderatorChain = createMockQueryChain({
        data: { id: 'admin-1', username: 'admin', avatar: null, is_company_verified: true },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(authorChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(moderatorChain);

      const result = await service.getContentDetail('feed_post', 'post-1');

      expect(result.data.moderated_by.username).toBe('admin');
      expect(result.data.moderation_status).toBe('hidden');
      expect(result.data.reports_count).toBe(5);
      expect(result.data.moderation_reason).toBe('spam');
    });

    it('should fallback to is_hidden status when no moderation record and null author', async () => {
      const sourceChain = createMockQueryChain({
        data: {
          id: 'post-1', content: 'Content', user_id: null,
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: true, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        error: null,
      });
      const modChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain);

      const result = await service.getContentDetail('feed_post', 'post-1');

      expect(result.data.moderation_status).toBe('hidden');
      expect(result.data.author).toBeNull();
      expect(result.data.moderated_by).toBeNull();
    });

    it('should use hidden_by for moderator lookup when no cmData.moderated_by', async () => {
      const sourceChain = createMockQueryChain({
        data: {
          id: 'post-1', content: 'Content', user_id: 'user-1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: true, hidden_by: 'admin-1', hidden_at: '2025-01-02', hidden_reason: 'spam',
        },
        error: null,
      });
      const authorChain = createMockQueryChain({
        data: { id: 'user-1', username: 'author', avatar: null, email: 'a@b.com', is_company_verified: false },
        error: null,
      });
      const modChain = createMockQueryChain({ data: null, error: null });
      const moderatorChain = createMockQueryChain({
        data: { id: 'admin-1', username: 'admin_mod', avatar: null, is_company_verified: true },
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(authorChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(moderatorChain);

      const result = await service.getContentDetail('feed_post', 'post-1');

      expect(result.data.moderated_by.username).toBe('admin_mod');
    });
  });

  // ─── hideContent ────────────────────────────────────────────

  describe('hideContent', () => {
    it('should throw for invalid content type', async () => {
      await expect(
        service.hideContent('admin-1', 'Admin', 'invalid', 'p1', 'Spam'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should hide content with existing moderation record (update path)', async () => {
      // upsertModeration: select existing record
      const existingChain = createMockQueryChain({ data: { id: 'mod-1' }, error: null });
      // upsertModeration: update existing
      const updateModChain = createMockQueryChain({ data: null, error: null });
      // updateSourceHidden: update source table
      const updateSourceChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(updateModChain)
        .mockReturnValueOnce(updateSourceChain);

      const result = await service.hideContent(
        'admin-1', 'Admin', 'feed_post', 'p1', 'Spam', '127.0.0.1',
      );

      expect(result).toEqual({ success: true, data: null });
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'hide_content', 'feed_post', 'p1', 'Spam', {}, '127.0.0.1',
      );
    });

    it('should hide content with no existing moderation record (insert path)', async () => {
      const noExistingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateSourceChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(noExistingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateSourceChain);

      const result = await service.hideContent(
        'admin-1', 'Admin', 'forum_topic', 'topic-1', 'offensive',
      );

      expect(result).toEqual({ success: true, data: null });
      expect(mockAdminUsers.logAction).toHaveBeenCalled();
    });

    it('should throw BadRequestException when upsert update fails', async () => {
      const existingChain = createMockQueryChain({ data: { id: 'mod-1' }, error: null });
      const updateErrorChain = createMockQueryChain({ data: null, error: { message: 'Update failed' } });

      mockClient.from
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(updateErrorChain);

      await expect(
        service.hideContent('admin-1', 'Admin', 'feed_post', 'p1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when upsert insert fails', async () => {
      const noExistingChain = createMockQueryChain({ data: null, error: null });
      const insertErrorChain = createMockQueryChain({ data: null, error: { message: 'Insert failed' } });

      mockClient.from
        .mockReturnValueOnce(noExistingChain)
        .mockReturnValueOnce(insertErrorChain);

      await expect(
        service.hideContent('admin-1', 'Admin', 'feed_post', 'p1', 'reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── restoreContent ─────────────────────────────────────────

  describe('restoreContent', () => {
    it('should throw for invalid content type', async () => {
      await expect(
        service.restoreContent('admin-1', 'Admin', 'bad', 'p1', 'x'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should restore content successfully and log action', async () => {
      const existingChain = createMockQueryChain({ data: { id: 'mod-1' }, error: null });
      const updateModChain = createMockQueryChain({ data: null, error: null });
      const updateSourceChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(updateModChain)
        .mockReturnValueOnce(updateSourceChain);

      const result = await service.restoreContent(
        'admin-1', 'Admin', 'feed_post', 'p1', 'Restored', '10.0.0.1',
      );

      expect(result).toEqual({ success: true, data: null });
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'restore_content', 'feed_post', 'p1', 'Restored', {}, '10.0.0.1',
      );
    });

    it('should restore content via insert path when no existing moderation record', async () => {
      const noExistingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const updateSourceChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(noExistingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateSourceChain);

      const result = await service.restoreContent(
        'admin-1', 'Admin', 'feed_post', 'p1', 'Restored',
      );

      expect(result.success).toBe(true);
      // updateSourceHidden should set hidden fields to null for restore
      expect(mockClient.from).toHaveBeenCalledWith('feed_posts');
    });
  });

  // ─── deleteContent ──────────────────────────────────────────

  describe('deleteContent', () => {
    it('should throw for invalid content type', async () => {
      await expect(
        service.deleteContent('admin-1', 'Admin', 'bad', 'p1', 'x'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should soft-delete content and return null (204)', async () => {
      const existingChain = createMockQueryChain({ data: { id: 'mod-1' }, error: null });
      const updateModChain = createMockQueryChain({ data: null, error: null });
      const deleteSourceChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(updateModChain)
        .mockReturnValueOnce(deleteSourceChain);

      const result = await service.deleteContent(
        'admin-1', 'Admin', 'feed_post', 'p1', 'Violation', '10.0.0.1',
      );

      expect(result).toBeNull();
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'remove_content', 'feed_post', 'p1', 'Violation', {}, '10.0.0.1',
      );
    });

    it('should soft-delete via insert path when no existing moderation record', async () => {
      const noExistingChain = createMockQueryChain({ data: null, error: null });
      const insertChain = createMockQueryChain({ data: null, error: null });
      const deleteSourceChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(noExistingChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(deleteSourceChain);

      const result = await service.deleteContent(
        'admin-1', 'Admin', 'nook', 'nook-1', 'violation',
      );

      expect(result).toBeNull();
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'remove_content', 'nook', 'nook-1', 'violation', {}, undefined,
      );
    });
  });

  // ─── pinTopic ───────────────────────────────────────────────

  describe('pinTopic', () => {
    it('should pin a topic', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.pinTopic('admin-1', 'Admin', 'topic-1', true);
      expect(result.success).toBe(true);
      expect(result.data.is_pinned).toBe(true);
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'pin_topic', 'forum_topic', 'topic-1', undefined, {}, undefined,
      );
    });

    it('should unpin a topic', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.pinTopic('admin-1', 'Admin', 'topic-1', false, '127.0.0.1');
      expect(result.success).toBe(true);
      expect(result.data.is_pinned).toBe(false);
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'unpin_topic', 'forum_topic', 'topic-1', undefined, {}, '127.0.0.1',
      );
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.pinTopic('admin-1', 'Admin', 'topic-1', true)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── lockTopic ──────────────────────────────────────────────

  describe('lockTopic', () => {
    it('should lock a topic', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.lockTopic('admin-1', 'Admin', 'topic-1', true, '127.0.0.1');
      expect(result.success).toBe(true);
      expect(result.data.is_locked).toBe(true);
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'lock_topic', 'forum_topic', 'topic-1', undefined, {}, '127.0.0.1',
      );
    });

    it('should unlock a topic', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.lockTopic('admin-1', 'Admin', 'topic-1', false);
      expect(result.success).toBe(true);
      expect(result.data.is_locked).toBe(false);
      expect(mockAdminUsers.logAction).toHaveBeenCalledWith(
        'admin-1', 'Admin', 'unlock_topic', 'forum_topic', 'topic-1', undefined, {}, undefined,
      );
    });

    it('should throw on DB error', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'fail' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.lockTopic('admin-1', 'Admin', 'topic-1', true)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── exportContent ──────────────────────────────────────────

  describe('exportContent — CSV', () => {
    it('should export CSV with empty result when no matching content', async () => {
      const chain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(chain);

      const result = await service.exportContent({ type: 'feed_post' } as any, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('.csv');
      expect(result.contentType).toContain('text/csv');
    });

    it('should export CSV with actual feed_post data', async () => {
      const feedPostsChain = createMockQueryChain({
        data: [{
          id: 'p1', content: 'Test content', user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        }],
        error: null,
      });
      const moderationChain = createMockQueryChain({ data: [], error: null });
      const usersChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'author1', email: 'u1@test.com', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(feedPostsChain)
        .mockReturnValueOnce(moderationChain)
        .mockReturnValueOnce(usersChain);

      const result = await service.exportContent({ type: 'feed_post' } as any, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('.csv');
      expect(result.buffer.toString()).toContain('author1');
      expect(result.buffer.toString()).toContain('Content ID');
    });

    it('should export CSV with hidden content filter', async () => {
      const feedPostsChain = createMockQueryChain({
        data: [{
          id: 'p1', content: 'Hidden post', user_id: 'u1',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          is_hidden: true, hidden_by: 'admin-1', hidden_at: '2026-01-02T00:00:00Z', hidden_reason: 'Spam',
        }],
        error: null,
      });
      const moderationChain = createMockQueryChain({ data: [], error: null });
      const usersChain = createMockQueryChain({
        data: [
          { id: 'u1', username: 'author1', email: 'u1@test.com', avatar: null, is_company_verified: false },
          { id: 'admin-1', username: 'Admin', email: 'admin@test.com', avatar: null, is_company_verified: false },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(feedPostsChain)
        .mockReturnValueOnce(moderationChain)
        .mockReturnValueOnce(usersChain);

      const result = await service.exportContent({ type: 'feed_post', status: 'hidden' } as any, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.buffer.toString()).toContain('author1');
      expect(result.filename).toContain('hidden');
    });

    it('should export all content types when no type specified', async () => {
      const emptyChain = createMockQueryChain({ data: [], error: null });
      mockClient.from.mockReturnValue(emptyChain);

      const result = await service.exportContent({} as any, 'csv');
      expect(result.buffer).toBeDefined();
      expect(result.contentType).toContain('text/csv');
    });

    it('should apply flagged filter in export CSV', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Flagged', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        {
          id: 'post-2', content: 'Not flagged', user_id: 'u1',
          created_at: '2025-01-02', updated_at: '2025-01-02',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        {
          id: 'm1', content_id: 'post-1', moderation_status: 'visible',
          moderation_reason: null, reports_count: 3, moderated_by: null, moderated_at: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', email: 'u@b.com', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.exportContent({ type: 'feed_post', flagged: 'true' }, 'csv');

      const csvText = result.buffer.toString('utf-8');
      expect(csvText).toContain('post-1');
      expect(csvText).not.toContain('post-2');
      expect(result.filename).toContain('flagged');
    });

    it('should sort export content ascending', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'A', user_id: 'u1',
          created_at: '2025-01-02', updated_at: '2025-01-02',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
        {
          id: 'post-2', content: 'B', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', email: 'e@b.com', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.exportContent(
        { type: 'feed_post', sortBy: 'created_at', sortOrder: 'asc' },
        'csv',
      );

      const csvText = result.buffer.toString('utf-8');
      const lines = csvText.split('\n');
      // First data row should be the earlier date (post-2)
      expect(lines[1]).toContain('post-2');
    });

    it('should include moderation data in export with moderator username', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Modded', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];
      const modData = [
        {
          id: 'mod-1', content_id: 'post-1', moderation_status: 'hidden',
          moderation_reason: 'spam', reports_count: 5,
          moderated_by: 'admin-1', moderated_at: '2025-01-02',
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: modData, error: null });
      const userChain = createMockQueryChain({
        data: [
          { id: 'u1', username: 'author', email: 'a@b.com', avatar: null, is_company_verified: false },
          { id: 'admin-1', username: 'mod_user', email: 'm@b.com', avatar: null, is_company_verified: true },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.exportContent({ type: 'feed_post' }, 'csv');

      const csvText = result.buffer.toString('utf-8');
      expect(csvText).toContain('mod_user');
      expect(csvText).toContain('hidden');
    });

    it('should escape CSV fields with quotes and newlines', async () => {
      const sourceData = [
        {
          id: 'post-1', content: 'Content with "quotes" and\nnewlines', user_id: 'u1',
          created_at: '2025-01-01', updated_at: '2025-01-01',
          is_hidden: false, hidden_by: null, hidden_at: null, hidden_reason: null,
        },
      ];

      const sourceChain = createMockQueryChain({ data: sourceData, error: null });
      const modChain = createMockQueryChain({ data: [], error: null });
      const userChain = createMockQueryChain({
        data: [{ id: 'u1', username: 'u', email: 'u@b.com', avatar: null, is_company_verified: false }],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(sourceChain)
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(userChain);

      const result = await service.exportContent({ type: 'feed_post' }, 'csv');

      const csvText = result.buffer.toString('utf-8');
      // Quotes should be escaped as ""
      expect(csvText).toContain('""quotes""');
      // Newlines should be replaced with spaces
      expect(csvText).not.toContain('\n\n');
    });
  });
});
