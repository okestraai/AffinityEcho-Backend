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
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ModerationReviewService } from '../../modules/admin/services/moderation-review.service';
import { supabaseAdmin } from '../../database/supabase.client';
import {
  createMockSupabaseClient,
  createMockQueryChain,
  createMockConfigService,
} from '../helpers/mock-supabase';

describe('ModerationReviewService', () => {
  let service: ModerationReviewService;
  let mockClient: any;
  let mockConfig: any;
  let mockEmailService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { client } = createMockSupabaseClient();
    mockClient = client;
    (supabaseAdmin as jest.Mock).mockReturnValue(mockClient);
    mockConfig = createMockConfigService();
    mockEmailService = {
      sendContentRestoredEmail: jest.fn().mockResolvedValue({}),
      sendContentHiddenEmail: jest.fn().mockResolvedValue({}),
    };
    service = new ModerationReviewService(
      mockConfig as any,
      mockEmailService as any,
    );
  });

  // ─── getQueue ──────────────────────────────────────────────────

  describe('getQueue', () => {
    it('should return paginated items sorted by priority (urgent first)', async () => {
      const items = [
        { id: '1', priority: 'low', claimed_by: null, resolved_by: null },
        { id: '2', priority: 'urgent', claimed_by: null, resolved_by: null },
        { id: '3', priority: 'high', claimed_by: null, resolved_by: null },
      ];
      const chain = createMockQueryChain({ data: items, error: null, count: 3 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getQueue({});

      expect(result.success).toBe(true);
      expect(result.data[0].priority).toBe('urgent');
      expect(result.data[1].priority).toBe('high');
      expect(result.data[2].priority).toBe('low');
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should default to pending + claimed status when no status filter', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getQueue({});

      expect(chain.in).toHaveBeenCalledWith('status', ['pending', 'claimed']);
    });

    it('should filter by specific status when provided', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getQueue({ status: 'resolved' });

      expect(chain.eq).toHaveBeenCalledWith('status', 'resolved');
      expect(chain.in).not.toHaveBeenCalled();
    });

    it('should filter by priority when provided', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getQueue({ priority: 'urgent' });

      expect(chain.eq).toHaveBeenCalledWith('priority', 'urgent');
    });

    it('should filter by contentType when provided', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getQueue({ contentType: 'feed_post' });

      expect(chain.eq).toHaveBeenCalledWith('content_type', 'feed_post');
    });

    it('should enrich claimed_by and resolved_by with admin usernames', async () => {
      const items = [
        { id: '1', priority: 'normal', claimed_by: 'admin-1', resolved_by: 'admin-2' },
      ];
      const queueChain = createMockQueryChain({ data: items, error: null, count: 1 });
      const profileChain = createMockQueryChain({
        data: [
          { id: 'admin-1', username: 'AdminAlice' },
          { id: 'admin-2', username: 'AdminBob' },
        ],
        error: null,
      });
      mockClient.from
        .mockReturnValueOnce(queueChain)
        .mockReturnValueOnce(profileChain);

      const result = await service.getQueue({});

      expect(result.data[0].claimed_by_username).toBe('AdminAlice');
      expect(result.data[0].resolved_by_username).toBe('AdminBob');
      expect(mockClient.from).toHaveBeenCalledWith('user_profiles');
    });

    it('should handle items with no claimed_by or resolved_by (no admin lookup)', async () => {
      const items = [
        { id: '1', priority: 'normal', claimed_by: null, resolved_by: null },
      ];
      const chain = createMockQueryChain({ data: items, error: null, count: 1 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getQueue({});

      expect(result.data[0].claimed_by_username).toBeNull();
      expect(result.data[0].resolved_by_username).toBeNull();
      // Should NOT call user_profiles since no admin IDs
      expect(mockClient.from).toHaveBeenCalledTimes(1);
    });

    it('should handle empty results', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getQueue({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'DB failure' },
        count: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getQueue({})).rejects.toThrow(BadRequestException);
    });

    it('should calculate pagination correctly with custom page and limit', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 50 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getQueue({ page: 2, limit: 10 });

      expect(chain.range).toHaveBeenCalledWith(10, 19);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('should handle unknown priority values by sorting them last', async () => {
      const items = [
        { id: '1', priority: 'unknown', claimed_by: null, resolved_by: null },
        { id: '2', priority: 'urgent', claimed_by: null, resolved_by: null },
      ];
      const chain = createMockQueryChain({ data: items, error: null, count: 2 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getQueue({});

      expect(result.data[0].priority).toBe('urgent');
      expect(result.data[1].priority).toBe('unknown');
    });
  });

  // ─── claimItem ──────────────────────────────────────────────────

  describe('claimItem', () => {
    it('should successfully claim a pending item', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'item-1', status: 'pending', claimed_by: null },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.claimItem('item-1', 'admin-1');

      expect(result).toEqual({ success: true, message: 'Item claimed' });
      expect(updateChain.update).toHaveBeenCalledWith({
        status: 'claimed',
        claimed_by: 'admin-1',
      });
    });

    it('should throw NotFoundException when item not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.claimItem('no-item', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when fetch returns null data', async () => {
      const chain = createMockQueryChain({ data: null, error: null });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.claimItem('no-item', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when already claimed by another admin', async () => {
      const chain = createMockQueryChain({
        data: { id: 'item-1', status: 'claimed', claimed_by: 'other-admin' },
        error: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.claimItem('item-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow re-claim by same admin', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'item-1', status: 'claimed', claimed_by: 'admin-1' },
        error: null,
      });
      const updateChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.claimItem('item-1', 'admin-1');

      expect(result).toEqual({ success: true, message: 'Item claimed' });
    });

    it('should throw BadRequestException when update fails', async () => {
      const fetchChain = createMockQueryChain({
        data: { id: 'item-1', status: 'pending', claimed_by: null },
        error: null,
      });
      const updateChain = createMockQueryChain({
        data: null,
        error: { message: 'Update failed' },
      });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      await expect(service.claimItem('item-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── resolveItem ──────────────────────────────────────────────

  describe('resolveItem', () => {
    it('should successfully resolve with confirm', async () => {
      const fetchChain = createMockQueryChain({
        data: {
          id: 'item-1',
          content_type: 'feed_post',
          content_id: 'post-1',
          ai_verdict: { rationale: 'spam detected' },
          current_state: 'hidden',
        },
        error: null,
      });
      const updateQueueChain = createMockQueryChain({ data: null, error: null });
      const updateModerationChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)       // fetch item
        .mockReturnValueOnce(updateQueueChain) // update queue
        .mockReturnValueOnce(updateModerationChain); // update content_moderation

      const result = await service.resolveItem('item-1', 'admin-1', 'confirm', 'Agreed');

      expect(result).toEqual({ success: true, message: 'Item confirmed' });
      expect(updateQueueChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolved_by: 'admin-1',
          resolution: 'confirm',
          resolution_reason: 'Agreed',
        }),
      );
      expect(updateModerationChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          moderated_by: 'human:admin-1',
        }),
      );
    });

    it('should use ai_verdict rationale when no reason provided', async () => {
      const fetchChain = createMockQueryChain({
        data: {
          id: 'item-1',
          content_type: 'feed_post',
          content_id: 'post-1',
          ai_verdict: { rationale: 'spam detected' },
          current_state: 'hidden',
        },
        error: null,
      });
      const updateQueueChain = createMockQueryChain({ data: null, error: null });
      const updateModerationChain = createMockQueryChain({ data: null, error: null });
      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateQueueChain)
        .mockReturnValueOnce(updateModerationChain);

      await service.resolveItem('item-1', 'admin-1', 'confirm');

      expect(updateQueueChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ resolution_reason: null }),
      );
      expect(updateModerationChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          moderation_reason: 'spam detected',
        }),
      );
    });

    it('should throw NotFoundException when item not found', async () => {
      const chain = createMockQueryChain({ data: null, error: { message: 'not found' } });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(
        service.resolveItem('no-item', 'admin-1', 'confirm'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reverse a hidden item: restore content, send email, log disagreement', async () => {
      const fetchChain = createMockQueryChain({
        data: {
          id: 'item-1',
          content_type: 'feed_post',
          content_id: 'post-1',
          ai_verdict: { rationale: 'spam' },
          current_state: 'hidden',
        },
        error: null,
      });
      const updateQueueChain = createMockQueryChain({ data: null, error: null });
      const updateModerationChain = createMockQueryChain({ data: null, error: null });
      // reverseAction -> restoreContent: update source table
      const restoreChain = createMockQueryChain({ data: null, error: null });
      // reverseAction -> update content_moderation with visible status
      const updateModStatusChain = createMockQueryChain({ data: null, error: null });
      // sendRestoredNotification -> fetch content author
      const contentChain = createMockQueryChain({
        data: { user_id: 'author-1' },
        error: null,
      });
      // sendRestoredNotification -> fetch user profile
      const profileChain = createMockQueryChain({
        data: { email: 'author@test.com', username: 'AuthorName' },
        error: null,
      });
      // log disagreement insert
      const disagreementChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)           // 1. fetch item
        .mockReturnValueOnce(updateQueueChain)     // 2. update queue
        .mockReturnValueOnce(updateModerationChain) // 3. update content_moderation
        .mockReturnValueOnce(restoreChain)         // 4. restoreContent: update source table
        .mockReturnValueOnce(updateModStatusChain) // 5. update moderation status to visible
        .mockReturnValueOnce(contentChain)         // 6. fetch content for author id
        .mockReturnValueOnce(profileChain)         // 7. fetch user profile for email
        .mockReturnValueOnce(disagreementChain);   // 8. insert disagreement

      const result = await service.resolveItem('item-1', 'admin-1', 'reverse', 'Not spam');

      expect(result).toEqual({ success: true, message: 'Item reversed' });

      // Verify restoreContent updated source table
      expect(restoreChain.update).toHaveBeenCalledWith({
        is_hidden: false,
        hidden_by: null,
        hidden_at: null,
        hidden_reason: null,
      });

      // Verify email sent
      expect(mockEmailService.sendContentRestoredEmail).toHaveBeenCalledWith(
        'author@test.com',
        'AuthorName',
        'post',
      );

      // Verify disagreement logged
      expect(disagreementChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-uuid-1234',
          content_type: 'feed_post',
          content_id: 'post-1',
          human_resolution: 'reverse',
          human_reason: 'Not spam',
          resolved_by: 'admin-1',
        }),
      );
    });

    it('should reverse a visible item: hide content', async () => {
      const fetchChain = createMockQueryChain({
        data: {
          id: 'item-1',
          content_type: 'feed_comment',
          content_id: 'comment-1',
          ai_verdict: { rationale: 'allowed' },
          current_state: 'visible',
        },
        error: null,
      });
      const updateQueueChain = createMockQueryChain({ data: null, error: null });
      const updateModerationChain = createMockQueryChain({ data: null, error: null });
      // reverseAction -> hideContent: update source table
      const hideChain = createMockQueryChain({ data: null, error: null });
      // reverseAction -> update content_moderation with hidden status
      const updateModStatusChain = createMockQueryChain({ data: null, error: null });
      // disagreement insert
      const disagreementChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateQueueChain)
        .mockReturnValueOnce(updateModerationChain)
        .mockReturnValueOnce(hideChain)
        .mockReturnValueOnce(updateModStatusChain)
        .mockReturnValueOnce(disagreementChain);

      const result = await service.resolveItem('item-1', 'admin-1', 'reverse', 'Offensive');

      expect(result).toEqual({ success: true, message: 'Item reversed' });

      // Verify hideContent updated source table
      expect(hideChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_hidden: true,
          hidden_by: 'admin-1',
          hidden_reason: 'Offensive',
        }),
      );

      // No restored email should be sent for hiding
      expect(mockEmailService.sendContentRestoredEmail).not.toHaveBeenCalled();
    });

    it('should not send email if author profile has no email', async () => {
      const fetchChain = createMockQueryChain({
        data: {
          id: 'item-1',
          content_type: 'feed_post',
          content_id: 'post-1',
          ai_verdict: { rationale: 'spam' },
          current_state: 'hidden',
        },
        error: null,
      });
      const updateQueueChain = createMockQueryChain({ data: null, error: null });
      const updateModerationChain = createMockQueryChain({ data: null, error: null });
      const restoreChain = createMockQueryChain({ data: null, error: null });
      const updateModStatusChain = createMockQueryChain({ data: null, error: null });
      const contentChain = createMockQueryChain({
        data: { user_id: 'author-1' },
        error: null,
      });
      const profileChain = createMockQueryChain({
        data: { email: null, username: 'NoEmail' },
        error: null,
      });
      const disagreementChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateQueueChain)
        .mockReturnValueOnce(updateModerationChain)
        .mockReturnValueOnce(restoreChain)
        .mockReturnValueOnce(updateModStatusChain)
        .mockReturnValueOnce(contentChain)
        .mockReturnValueOnce(profileChain)
        .mockReturnValueOnce(disagreementChain);

      await service.resolveItem('item-1', 'admin-1', 'reverse', 'Not spam');

      expect(mockEmailService.sendContentRestoredEmail).not.toHaveBeenCalled();
    });

    it('should handle unknown content_type in reverseAction gracefully', async () => {
      const fetchChain = createMockQueryChain({
        data: {
          id: 'item-1',
          content_type: 'unknown_type',
          content_id: 'x-1',
          ai_verdict: { rationale: 'test' },
          current_state: 'hidden',
        },
        error: null,
      });
      const updateQueueChain = createMockQueryChain({ data: null, error: null });
      const updateModerationChain = createMockQueryChain({ data: null, error: null });
      // restoreContent skips for unknown type, no source table update
      // update moderation status still happens
      const updateModStatusChain = createMockQueryChain({ data: null, error: null });
      // sendRestoredNotification returns early for unknown type
      // disagreement insert
      const disagreementChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateQueueChain)
        .mockReturnValueOnce(updateModerationChain)
        .mockReturnValueOnce(updateModStatusChain) // content_moderation visible update
        .mockReturnValueOnce(disagreementChain);   // disagreement insert

      const result = await service.resolveItem('item-1', 'admin-1', 'reverse');

      expect(result).toEqual({ success: true, message: 'Item reversed' });
    });
  });

  // ─── getStats ──────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return queue counts and performance stats', async () => {
      // Promise.all: 4 parallel calls
      const pendingChain = createMockQueryChain({ data: null, error: null, count: 5 });
      const claimedChain = createMockQueryChain({ data: null, error: null, count: 2 });
      const resolvedChain = createMockQueryChain({ data: null, error: null, count: 10 });
      const disagreementsChain = createMockQueryChain({ data: null, error: null, count: 3 });
      // priority breakdown
      const priorityChain = createMockQueryChain({
        data: [
          { priority: 'urgent' },
          { priority: 'urgent' },
          { priority: 'high' },
          { priority: 'normal' },
          { priority: 'normal' },
        ],
        error: null,
      });
      // verdict distribution
      const verdictChain = createMockQueryChain({
        data: [
          { moderation_status: 'hidden', ai_confidence: 0.9 },
          { moderation_status: 'hidden', ai_confidence: 0.8 },
          { moderation_status: 'visible', ai_confidence: 0.95 },
        ],
        error: null,
      });

      mockClient.from
        .mockReturnValueOnce(pendingChain)       // 1. pending count
        .mockReturnValueOnce(claimedChain)       // 2. claimed count
        .mockReturnValueOnce(resolvedChain)      // 3. resolved count
        .mockReturnValueOnce(disagreementsChain) // 4. disagreements count
        .mockReturnValueOnce(priorityChain)      // 5. priority breakdown
        .mockReturnValueOnce(verdictChain);      // 6. verdict distribution

      const result = await service.getStats();

      expect(result.success).toBe(true);
      expect(result.data.queue.pending).toBe(5);
      expect(result.data.queue.claimed).toBe(2);
      expect(result.data.queue.resolved).toBe(10);
      expect(result.data.queue.byPriority).toEqual({
        urgent: 2,
        high: 1,
        normal: 2,
        low: 0,
      });
      expect(result.data.aiPerformance.totalDecisions).toBe(3);
      expect(result.data.aiPerformance.verdictDistribution).toEqual({
        hidden: 2,
        visible: 1,
      });
      expect(result.data.aiPerformance.reversalRate).toBe('30.0%');
      expect(result.data.aiPerformance.totalDisagreements).toBe(3);
    });

    it('should return 0.0% reversal rate when no resolved items', async () => {
      const pendingChain = createMockQueryChain({ data: null, error: null, count: 0 });
      const claimedChain = createMockQueryChain({ data: null, error: null, count: 0 });
      const resolvedChain = createMockQueryChain({ data: null, error: null, count: 0 });
      const disagreementsChain = createMockQueryChain({ data: null, error: null, count: 0 });
      const priorityChain = createMockQueryChain({ data: [], error: null });
      const verdictChain = createMockQueryChain({ data: [], error: null });

      mockClient.from
        .mockReturnValueOnce(pendingChain)
        .mockReturnValueOnce(claimedChain)
        .mockReturnValueOnce(resolvedChain)
        .mockReturnValueOnce(disagreementsChain)
        .mockReturnValueOnce(priorityChain)
        .mockReturnValueOnce(verdictChain);

      const result = await service.getStats();

      expect(result.data.aiPerformance.reversalRate).toBe('0.0%');
      expect(result.data.queue.byPriority).toEqual({
        urgent: 0,
        high: 0,
        normal: 0,
        low: 0,
      });
    });
  });

  // ─── getAuditLog ──────────────────────────────────────────────

  describe('getAuditLog', () => {
    it('should return paginated audit entries filtered by ai moderated_by', async () => {
      const entries = [
        { id: '1', content_type: 'feed_post', moderated_by: 'ai:gpt-4' },
        { id: '2', content_type: 'feed_comment', moderated_by: 'ai:gpt-4' },
      ];
      const chain = createMockQueryChain({ data: entries, error: null, count: 2 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getAuditLog({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entries);
      expect(chain.like).toHaveBeenCalledWith('moderated_by', 'ai:%');
      expect(result.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
    });

    it('should filter by contentType when provided', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getAuditLog({ contentType: 'forum_topic' });

      expect(chain.eq).toHaveBeenCalledWith('content_type', 'forum_topic');
    });

    it('should apply custom pagination', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 100 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getAuditLog({ page: 3, limit: 10 });

      expect(chain.range).toHaveBeenCalledWith(20, 29);
      expect(result.pagination.page).toBe(3);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'Query failed' },
        count: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getAuditLog({})).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getItemAudit ──────────────────────────────────────────────

  describe('getItemAudit', () => {
    it('should return moderation history, review history, and disagreements', async () => {
      const modHistory = [{ id: 'm1', moderated_by: 'ai:gpt-4' }];
      const reviewHistory = [{ id: 'r1', status: 'resolved' }];
      const disagreements = [{ id: 'd1', human_resolution: 'reverse' }];

      const modChain = createMockQueryChain({ data: modHistory, error: null });
      const reviewChain = createMockQueryChain({ data: reviewHistory, error: null });
      const disagreeChain = createMockQueryChain({ data: disagreements, error: null });

      mockClient.from
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(reviewChain)
        .mockReturnValueOnce(disagreeChain);

      const result = await service.getItemAudit('feed_post', 'post-1');

      expect(result.success).toBe(true);
      expect(result.data.moderation).toEqual(modHistory);
      expect(result.data.reviews).toEqual(reviewHistory);
      expect(result.data.disagreements).toEqual(disagreements);

      expect(mockClient.from).toHaveBeenCalledWith('content_moderation');
      expect(mockClient.from).toHaveBeenCalledWith('moderation_review_queue');
      expect(mockClient.from).toHaveBeenCalledWith('moderation_disagreements');
    });

    it('should return empty arrays when no data found', async () => {
      const modChain = createMockQueryChain({ data: null, error: null });
      const reviewChain = createMockQueryChain({ data: null, error: null });
      const disagreeChain = createMockQueryChain({ data: null, error: null });

      mockClient.from
        .mockReturnValueOnce(modChain)
        .mockReturnValueOnce(reviewChain)
        .mockReturnValueOnce(disagreeChain);

      const result = await service.getItemAudit('feed_post', 'post-1');

      expect(result.data.moderation).toEqual([]);
      expect(result.data.reviews).toEqual([]);
      expect(result.data.disagreements).toEqual([]);
    });
  });

  // ─── getDisagreements ──────────────────────────────────────────

  describe('getDisagreements', () => {
    it('should return paginated disagreements', async () => {
      const items = [
        { id: 'd1', content_type: 'feed_post', human_resolution: 'reverse' },
      ];
      const chain = createMockQueryChain({ data: items, error: null, count: 1 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getDisagreements({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(items);
      expect(result.pagination.total).toBe(1);
      expect(mockClient.from).toHaveBeenCalledWith('moderation_disagreements');
    });

    it('should filter by contentType', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 0 });
      mockClient.from.mockReturnValueOnce(chain);

      await service.getDisagreements({ contentType: 'nook_message' });

      expect(chain.eq).toHaveBeenCalledWith('content_type', 'nook_message');
    });

    it('should throw BadRequestException on DB error', async () => {
      const chain = createMockQueryChain({
        data: null,
        error: { message: 'DB error' },
        count: null,
      });
      mockClient.from.mockReturnValueOnce(chain);

      await expect(service.getDisagreements({})).rejects.toThrow(BadRequestException);
    });

    it('should apply custom pagination with hasMore=true', async () => {
      const chain = createMockQueryChain({ data: [], error: null, count: 50 });
      mockClient.from.mockReturnValueOnce(chain);

      const result = await service.getDisagreements({ page: 1, limit: 10 });

      expect(chain.range).toHaveBeenCalledWith(0, 9);
      expect(result.pagination.hasMore).toBe(true);
    });
  });
});
