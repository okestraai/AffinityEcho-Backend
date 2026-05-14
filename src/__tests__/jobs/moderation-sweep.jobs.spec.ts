jest.mock('../../database/pg-client', () => ({
  getPool: jest.fn(),
}));

import { getPool } from '../../database/pg-client';
import { ModerationSweepJobs } from '../../jobs/moderation-sweep.jobs';

describe('ModerationSweepJobs', () => {
  let service: ModerationSweepJobs;
  let mockQueue: any;
  let mockPool: any;

  function createService(overrides: Record<string, string> = {}) {
    const defaults: Record<string, string> = {
      MODERATION_SWEEP_ENABLED: 'true',
      MODERATION_SWEEP_LOOKBACK_MINUTES: '120',
      MODERATION_SWEEP_MAX_PER_RUN: '100',
    };
    const vals = { ...defaults, ...overrides };
    const config = { get: jest.fn((key: string) => vals[key]) };

    mockQueue = { add: jest.fn().mockResolvedValue({}) };
    mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    (getPool as jest.Mock).mockReturnValue(mockPool);

    return new ModerationSweepJobs(config as any, mockQueue);
  }

  beforeEach(() => {
    service = createService();
  });

  describe('sweepUnmoderatedContent', () => {
    it('should do nothing when disabled', async () => {
      service = createService({ MODERATION_SWEEP_ENABLED: 'false' });
      await service.sweepUnmoderatedContent();
      expect(getPool).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should query all 8 content tables', async () => {
      await service.sweepUnmoderatedContent();
      // 8 tables queried
      expect(mockPool.query).toHaveBeenCalledTimes(8);
    });

    it('should enqueue unmoderated items found', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'post-1', author_id: 'user-1' },
          { id: 'post-2', author_id: 'user-2' },
        ],
      });
      // Remaining 7 tables return empty
      for (let i = 0; i < 7; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
      }

      await service.sweepUnmoderatedContent();

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'moderate',
        { contentType: 'feed_post', contentId: 'post-1', authorId: 'user-1' },
        expect.objectContaining({ jobId: 'feed_post-post-1' }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'moderate',
        { contentType: 'feed_post', contentId: 'post-2', authorId: 'user-2' },
        expect.objectContaining({ jobId: 'feed_post-post-2' }),
      );
    });

    it('should respect maxPerSweep limit by stopping at table boundary', async () => {
      service = createService({ MODERATION_SWEEP_MAX_PER_RUN: '2' });

      // First table returns exactly 2 items (hits max)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'fp-1', author_id: 'u1' },
          { id: 'fp-2', author_id: 'u2' },
        ],
      });

      await service.sweepUnmoderatedContent();

      // Stops after first table since max reached
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should stop querying tables after maxPerSweep reached', async () => {
      service = createService({ MODERATION_SWEEP_MAX_PER_RUN: '2' });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'fp-1', author_id: 'u1' },
          { id: 'fp-2', author_id: 'u2' },
        ],
      });

      await service.sweepUnmoderatedContent();

      // Only 1 table queried because max was hit
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should pass correct content type to each query', async () => {
      await service.sweepUnmoderatedContent();

      const expectedTypes = [
        'feed_post', 'feed_comment', 'forum_topic', 'forum_comment',
        'nook', 'nook_message', 'referral_post', 'referral_comment',
      ];

      expectedTypes.forEach((type, i) => {
        expect(mockPool.query.mock.calls[i][1][0]).toBe(type);
      });
    });

    it('should include nook expire clause for nooks table', async () => {
      await service.sweepUnmoderatedContent();

      // 5th call is nooks (index 4)
      const nookQuery = mockPool.query.mock.calls[4][0];
      expect(nookQuery).toContain("expires_at > NOW() + INTERVAL '1 hour'");
    });

    it('should include is_hidden filter for applicable tables', async () => {
      await service.sweepUnmoderatedContent();

      // feed_posts (index 0)
      expect(mockPool.query.mock.calls[0][0]).toContain('is_hidden');
      // forum_topics (index 2)
      expect(mockPool.query.mock.calls[2][0]).toContain('is_hidden');
      // nooks (index 4) — also has deleted_at
      expect(mockPool.query.mock.calls[4][0]).toContain('deleted_at');
    });

    it('should NOT include is_hidden for referral tables', async () => {
      await service.sweepUnmoderatedContent();

      // referral_posts (index 6)
      expect(mockPool.query.mock.calls[6][0]).not.toContain('is_hidden');
      // referral_comments (index 7)
      expect(mockPool.query.mock.calls[7][0]).not.toContain('is_hidden');
    });

    it('should handle queue add failure gracefully', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'fp-1', author_id: 'u1' },
          { id: 'fp-2', author_id: 'u2' },
        ],
      });
      for (let i = 0; i < 7; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
      }

      // First add fails, second succeeds
      mockQueue.add
        .mockRejectedValueOnce(new Error('Redis down'))
        .mockResolvedValueOnce({});

      await service.sweepUnmoderatedContent();

      // Both attempted, no throw
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should handle pool query failure gracefully', async () => {
      // First table query fails
      mockPool.query.mockRejectedValueOnce(new Error('DB connection lost'));
      // Rest succeed (empty)
      for (let i = 0; i < 7; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
      }

      await service.sweepUnmoderatedContent();

      // Should not throw, continues to next tables
      expect(mockPool.query).toHaveBeenCalledTimes(8);
    });

    it('should handle getPool throwing', async () => {
      (getPool as jest.Mock).mockImplementation(() => { throw new Error('Pool init failed'); });

      // Should not throw
      await service.sweepUnmoderatedContent();
    });

    it('should use correct lookback minutes in query', async () => {
      service = createService({ MODERATION_SWEEP_LOOKBACK_MINUTES: '60' });

      await service.sweepUnmoderatedContent();

      expect(mockPool.query.mock.calls[0][0]).toContain("INTERVAL '60 minutes'");
    });

    it('should pass remaining limit to each table query', async () => {
      service = createService({ MODERATION_SWEEP_MAX_PER_RUN: '50' });

      // First table returns 10
      mockPool.query.mockResolvedValueOnce({
        rows: Array.from({ length: 10 }, (_, i) => ({ id: `fp-${i}`, author_id: `u-${i}` })),
      });
      for (let i = 0; i < 7; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
      }

      await service.sweepUnmoderatedContent();

      // First call: limit = 50
      expect(mockPool.query.mock.calls[0][1][1]).toBe(50);
      // Second call: limit = 40 (50 - 10)
      expect(mockPool.query.mock.calls[1][1][1]).toBe(40);
    });

    it('should use correct author column for nooks', async () => {
      await service.sweepUnmoderatedContent();

      // nooks (index 4) uses creator_id
      expect(mockPool.query.mock.calls[4][0]).toContain('t.creator_id AS author_id');
    });

    it('should enqueue items from multiple tables', async () => {
      // feed_posts: 1 item
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'fp-1', author_id: 'u1' }] });
      // feed_comments: empty
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // forum_topics: 2 items
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'ft-1', author_id: 'u2' },
          { id: 'ft-2', author_id: 'u3' },
        ],
      });
      // Rest empty
      for (let i = 0; i < 5; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [] });
      }

      await service.sweepUnmoderatedContent();

      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'moderate',
        expect.objectContaining({ contentType: 'feed_post' }),
        expect.any(Object),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'moderate',
        expect.objectContaining({ contentType: 'forum_topic', contentId: 'ft-1' }),
        expect.any(Object),
      );
    });

    it('should use default config values when env vars not set', () => {
      const config = { get: jest.fn(() => undefined) };
      const svc = new ModerationSweepJobs(config as any, mockQueue);
      // enabled defaults to false (undefined !== 'true')
      // lookbackMinutes defaults to 120
      // maxPerSweep defaults to 100
      // Just verify construction doesn't throw
      expect(svc).toBeDefined();
    });
  });
});
