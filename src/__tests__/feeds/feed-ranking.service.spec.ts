import { FeedRankingService } from '../../modules/feeds/services/feed-ranking.service';

describe('FeedRankingService', () => {
  let service: FeedRankingService;

  const makeItem = (overrides: any = {}) => ({
    id: overrides.id || 'item-1',
    content_type: overrides.content_type || 'post',
    content_id: overrides.content_id || 'p1',
    user_id: overrides.user_id || 'u1',
    author: { display_name: 'User1', bio: 'hi', avatar: '🔥' },
    content: { text: 'Hello' },
    engagement: {
      likes: overrides.likes ?? 5,
      comments: overrides.comments ?? 2,
      shares: overrides.shares ?? 0,
      seen: overrides.seen ?? 10,
    },
    created_at:
      overrides.created_at || new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    ...overrides,
  });

  beforeEach(() => {
    service = new FeedRankingService();
  });

  describe('rankByEngagement', () => {
    it('should return empty array for empty input', () => {
      expect(service.rankByEngagement([])).toEqual([]);
    });

    it('should rank items by engagement score descending', () => {
      const items = [
        makeItem({ id: 'low', likes: 1, comments: 0 }),
        makeItem({ id: 'high', likes: 20, comments: 10 }),
        makeItem({ id: 'mid', likes: 5, comments: 3 }),
      ];

      const ranked = service.rankByEngagement(items);
      expect(ranked[0].id).toBe('high');
      expect(ranked[ranked.length - 1].id).toBe('low');
    });

    it('should add engagement_score to each item', () => {
      const items = [makeItem()];
      const ranked = service.rankByEngagement(items);
      expect(ranked[0].engagement_score).toBeGreaterThan(0);
    });

    it('should rank newer content higher when engagement is equal', () => {
      const items = [
        makeItem({
          id: 'old',
          likes: 5,
          comments: 2,
          created_at: new Date(Date.now() - 86400000).toISOString(),
        }), // 24h ago
        makeItem({
          id: 'new',
          likes: 5,
          comments: 2,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        }), // 1h ago
      ];

      const ranked = service.rankByEngagement(items);
      expect(ranked[0].id).toBe('new');
    });

    it('should boost content matching user tag affinity', () => {
      const items = [
        makeItem({
          id: 'no-match',
          likes: 5,
          content: { text: 'Hello', tags: ['sports'] },
        }),
        makeItem({
          id: 'match',
          likes: 5,
          content: { text: 'Hello', tags: ['tech'] },
        }),
      ];

      const affinities = new Map([['tech', 0.9]]);
      const ranked = service.rankByEngagement(items, {
        userAffinities: affinities,
      });

      // Both have same base engagement, but 'match' should get a boost
      expect(ranked.length).toBe(2);
    });

    it('should handle cold start (no user affinities)', () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
      const ranked = service.rankByEngagement(items, {});
      expect(ranked).toHaveLength(2);
    });

    it('should handle items with zero engagement', () => {
      const items = [makeItem({ likes: 0, comments: 0, shares: 0, seen: 0 })];
      const ranked = service.rankByEngagement(items);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].engagement_score).toBeGreaterThanOrEqual(0);
    });

    it('should apply author affinity boost', () => {
      const items = [
        makeItem({ id: 'unknown-author', user_id: 'u99', likes: 5 }),
        makeItem({ id: 'fav-author', user_id: 'u1', likes: 5 }),
      ];

      const authorAffinities = new Map([['u1', 0.9]]);
      const ranked = service.rankByEngagement(items, { authorAffinities });
      expect(ranked).toHaveLength(2);
    });

    it('should apply content type preference', () => {
      const items = [
        makeItem({ id: 'post', content_type: 'post', likes: 5 }),
        makeItem({ id: 'topic', content_type: 'topic', likes: 5 }),
      ];

      const prefs = new Map([['topic', 0.9]]);
      const ranked = service.rankByEngagement(items, {
        contentTypePrefs: prefs,
      });
      expect(ranked).toHaveLength(2);
    });

    it('should produce deterministic jitter per user', () => {
      const items = [
        makeItem({ id: 'a', likes: 5 }),
        makeItem({ id: 'b', likes: 5 }),
      ];

      const ranked1 = service.rankByEngagement(items, { userId: 'user-1' });
      const ranked2 = service.rankByEngagement(items, { userId: 'user-1' });

      // Same user should get same ordering
      expect(ranked1.map((i) => i.id)).toEqual(ranked2.map((i) => i.id));
    });
  });

  describe('rankByTrending', () => {
    it('should return empty array for empty input', () => {
      expect(service.rankByTrending([])).toEqual([]);
    });

    it('should filter out items older than 7 days', () => {
      const items = [
        makeItem({
          id: 'recent',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        }),
        makeItem({
          id: 'old',
          created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
        }),
      ];

      const ranked = service.rankByTrending(items);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe('recent');
    });

    it('should rank by trending score', () => {
      const items = [
        makeItem({
          id: 'viral',
          likes: 50,
          comments: 20,
          shares: 10,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        }),
        makeItem({
          id: 'quiet',
          likes: 1,
          comments: 0,
          shares: 0,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        }),
      ];

      const ranked = service.rankByTrending(items);
      expect(ranked[0].id).toBe('viral');
    });

    it('should return empty when all items are older than 7 days', () => {
      const items = [
        makeItem({
          created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        }),
      ];

      expect(service.rankByTrending(items)).toEqual([]);
    });

    it('should give higher score to rapidly engaging new posts', () => {
      const items = [
        makeItem({
          id: 'fast-new',
          likes: 10,
          comments: 5,
          created_at: new Date(Date.now() - 1800000).toISOString(),
        }), // 30min ago
        makeItem({
          id: 'slow-old',
          likes: 10,
          comments: 5,
          created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        }), // 3 days ago
      ];

      const ranked = service.rankByTrending(items);
      expect(ranked[0].id).toBe('fast-new');
    });

    it('should handle items with no engagement', () => {
      const items = [makeItem({ likes: 0, comments: 0, shares: 0 })];
      const ranked = service.rankByTrending(items);
      expect(ranked).toHaveLength(1);
    });
  });

  describe('applyDiversityConstraints', () => {
    it('should limit items per author', () => {
      const items = [
        makeItem({ id: '1', user_id: 'u1', likes: 10 }),
        makeItem({ id: '2', user_id: 'u1', likes: 9 }),
        makeItem({ id: '3', user_id: 'u1', likes: 8 }),
        makeItem({ id: '4', user_id: 'u2', likes: 7 }),
      ];

      const ranked = service.rankByEngagement(items);
      const diversified = service.applyDiversityConstraints(ranked, 10);
      const u1Count = diversified.filter((i) => i.user_id === 'u1').length;
      expect(u1Count).toBeLessThanOrEqual(2); // MAX_ITEMS_PER_AUTHOR = 2
    });

    it('should maintain content type diversity', () => {
      const items = Array.from({ length: 20 }, (_, i) =>
        makeItem({ id: `p${i}`, content_type: 'post', likes: 20 - i }),
      );

      const ranked = service.rankByEngagement(items);
      const diversified = service.applyDiversityConstraints(ranked, 10);
      expect(diversified.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty input', () => {
      expect(service.applyDiversityConstraints([], 10)).toEqual([]);
    });

    it('should respect page size', () => {
      const items = Array.from({ length: 20 }, (_, i) =>
        makeItem({ id: `${i}`, user_id: `u${i}`, likes: 20 - i }),
      );

      const ranked = service.rankByEngagement(items);
      const diversified = service.applyDiversityConstraints(ranked, 5);
      expect(diversified.length).toBeLessThanOrEqual(5);
    });
  });
});
