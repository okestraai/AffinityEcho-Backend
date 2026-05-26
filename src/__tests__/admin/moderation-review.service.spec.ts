jest.mock('../../database/supabase.client', () => ({
  supabaseAdmin: jest.fn(),
}));

import { supabaseAdmin } from '../../database/supabase.client';
import { ModerationReviewService } from '../../modules/admin/services/moderation-review.service';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('ModerationReviewService', () => {
  let service: ModerationReviewService;
  let mockClient: any;
  let mockEmailService: any;

  beforeEach(() => {
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);

    mockEmailService = {
      sendContentRestoredEmail: jest.fn().mockResolvedValue({}),
      sendContentHiddenEmail: jest.fn().mockResolvedValue({}),
    };

    const config = createMockConfigService();
    service = new ModerationReviewService(config as any, mockEmailService as any, { delPattern: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any);
  });

  describe('getQueue', () => {
    it('should return enriched review queue items with available_actions', async () => {
      const queueItems = [
        { id: 'rq-1', content_type: 'feed_post', content_id: 'post-1', priority: 'high', reason: 'high_severity_hide', current_state: 'hidden', status: 'pending', ai_verdict: { verdict: 'hide', confidence: 0.87 }, resolved_by: null, created_at: '2026-01-01' },
      ];

      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: queueItems, error: null, count: 1 }))
        .mockReturnValueOnce(createMockQueryChain({ data: { content: 'Bad content here', user_id: 'user-1' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'user-1', username: 'TestUser' }], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));

      const result = await service.getQueue({ status: 'pending' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].content_preview).toBe('Bad content here');
      expect(result.data[0].author.username).toBe('TestUser');
      expect(result.data[0].available_actions).toEqual(['reverse']);
    });

    it('should set available_actions to confirm/hide for visible items', async () => {
      const queueItems = [
        { id: 'rq-2', content_type: 'forum_comment', content_id: 'c-1', priority: 'normal', current_state: 'visible', status: 'pending', ai_verdict: { verdict: 'escalate' }, resolved_by: null, created_at: '2026-01-01' },
      ];

      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: queueItems, error: null, count: 1 }))
        .mockReturnValueOnce(createMockQueryChain({ data: { content: 'Some comment', user_id: 'user-2' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'user-2', username: 'User2' }], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));

      const result = await service.getQueue({});
      expect(result.data[0].available_actions).toEqual(['confirm', 'hide']);
    });

    it('should handle empty queue', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: [], error: null, count: 0 }));
      const result = await service.getQueue({});
      expect(result.data).toHaveLength(0);
    });

    it('should throw on DB error', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: null, error: { message: 'DB error' } }));
      await expect(service.getQueue({})).rejects.toThrow('DB error');
    });
  });

  describe('resolveItem', () => {
    const hiddenItem = {
      id: 'rq-1', content_type: 'feed_post', content_id: 'post-1', current_state: 'hidden',
      ai_verdict: { verdict: 'hide', confidence: 0.87, categories: ['harassment'], rationale: 'Bad' }, status: 'pending',
    };
    const visibleItem = {
      ...hiddenItem, id: 'rq-2', current_state: 'visible',
      ai_verdict: { verdict: 'escalate', confidence: 0.5 },
    };

    it('should reverse a hidden item', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: hiddenItem, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { user_id: 'author-1' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { email: 'a@test.com', username: 'Author' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }));

      const result = await service.resolveItem('rq-1', 'admin-1', 'reverse', 'Not harassment');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Content restored successfully');
      expect(result.data.new_state).toBe('visible');
      expect(mockEmailService.sendContentRestoredEmail).toHaveBeenCalledWith('a@test.com', 'Author', 'post');
    });

    it('should confirm a visible item', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: visibleItem, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }));

      const result = await service.resolveItem('rq-2', 'admin-1', 'confirm');
      expect(result.message).toBe('Content confirmed as safe');
    });

    it('should hide an escalated item', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: visibleItem, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { user_id: 'author-1' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { email: 'a@test.com', username: 'Author' }, error: null }));

      const result = await service.resolveItem('rq-2', 'admin-1', 'hide', 'Spam');
      expect(result.message).toBe('Content hidden successfully');
      expect(result.data.new_state).toBe('hidden');
      expect(mockEmailService.sendContentHiddenEmail).toHaveBeenCalled();
    });

    it('should reject reverse on visible item', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: visibleItem, error: null }));
      await expect(service.resolveItem('rq-2', 'admin-1', 'reverse')).rejects.toThrow('Cannot reverse');
    });

    it('should reject confirm on hidden item', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: hiddenItem, error: null }));
      await expect(service.resolveItem('rq-1', 'admin-1', 'confirm')).rejects.toThrow('Cannot confirm');
    });

    it('should reject hide on already hidden item', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: hiddenItem, error: null }));
      await expect(service.resolveItem('rq-1', 'admin-1', 'hide')).rejects.toThrow('Cannot hide');
    });

    it('should throw when item not found', async () => {
      mockClient.from.mockReturnValueOnce(createMockQueryChain({ data: null, error: { message: 'not found' } }));
      await expect(service.resolveItem('bad', 'admin-1', 'reverse')).rejects.toThrow('not found');
    });
  });

  describe('getReviewStats', () => {
    it('should return queue stats with priority and state breakdown', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: [{ priority: 'urgent', current_state: 'hidden' }, { priority: 'high', current_state: 'visible' }], error: null, count: 2 }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null, count: 10 }));

      const result = await service.getReviewStats();
      expect(result.data.queue.pending).toBe(2);
      expect(result.data.queue.resolved).toBe(10);
      expect(result.data.queue.byPriority.urgent).toBe(1);
      expect(result.data.queue.byState.hidden).toBe(1);
      expect(result.data.queue.byState.visible).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return overall AI performance stats', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: [
          { moderation_status: 'allowed', ai_confidence: 0.95, content_type: 'feed_post', raw_response: { categories: [] } },
          { moderation_status: 'hidden', ai_confidence: 0.87, content_type: 'feed_post', raw_response: { categories: ['harassment'] } },
        ], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null, count: 1 }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null, count: 2 }))
        .mockReturnValueOnce(createMockQueryChain({ data: null, error: null, count: 5 }));

      const result = await service.getStats();
      expect(result.data.totalDecisions).toBe(2);
      expect(result.data.verdictDistribution.allowed).toBe(1);
      expect(result.data.verdictDistribution.hidden).toBe(1);
      expect(result.data.hiddenByCategory.harassment).toBe(1);
      expect(result.data.reversals.total).toBe(1);
      expect(result.data.reviewQueue.pending).toBe(2);
    });
  });

  describe('getAuditLog', () => {
    it('should return enriched audit entries with was_reversed', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'cm-1', content_type: 'feed_post', content_id: 'p-1', moderated_by: 'ai:editorial', moderation_status: 'hidden' }], error: null, count: 1 }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ content_type: 'feed_post', content_id: 'p-1' }], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { content: 'Bad post', user_id: 'u-1' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'u-1', username: 'User1' }], error: null }));

      const result = await service.getAuditLog({});
      expect(result.data[0].was_reversed).toBe(true);
      expect(result.data[0].content_preview).toBe('Bad post');
      expect(result.data[0].author.username).toBe('User1');
    });
  });

  describe('getItemAudit', () => {
    it('should return full history for an item', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: { content: 'Full text', user_id: 'u-1', created_at: '2026-01-01', is_hidden: false }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: { id: 'u-1', username: 'TestUser' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ moderated_by: 'ai:editorial', moderation_status: 'hidden', moderated_at: '2026-01-01', ai_confidence: 0.87, moderation_reason: 'Bad' }], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [], error: null }));

      const result = await service.getItemAudit('feed_post', 'p-1');
      expect(result.data.content.preview).toBe('Full text');
      expect(result.data.content.author.username).toBe('TestUser');
      expect(result.data.moderation_history).toHaveLength(1);
    });
  });

  describe('getDisagreements', () => {
    it('should return enriched disagreements', async () => {
      mockClient.from
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'd-1', content_type: 'feed_post', content_id: 'p-1', ai_verdict: { verdict: 'hide' }, human_resolution: 'reverse', human_reason: 'Not bad', resolved_by: 'admin-1', created_at: '2026-01-01' }], error: null, count: 1 }))
        .mockReturnValueOnce(createMockQueryChain({ data: { content: 'Disputed', user_id: 'u-1' }, error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'u-1', username: 'User1' }], error: null }))
        .mockReturnValueOnce(createMockQueryChain({ data: [{ id: 'admin-1', username: 'AdminJohn' }], error: null }));

      const result = await service.getDisagreements({});
      expect(result.data[0].content_preview).toBe('Disputed');
      expect(result.data[0].reversed_by.username).toBe('AdminJohn');
    });
  });
});
