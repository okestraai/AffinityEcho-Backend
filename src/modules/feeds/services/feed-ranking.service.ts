import { Injectable } from '@nestjs/common';

/**
 * Engagement-based feed ranking model.
 *
 * Scores each feed item using weighted engagement signals + time decay + velocity +
 * per-user personalization (tag affinity, author affinity, content-type preference).
 *
 * Formula:
 *   rawScore = (likes * W_LIKE) + (comments * W_COMMENT) + (shares * W_SHARE) + (views * W_VIEW)
 *   decayFactor = 1 / (1 + ageHours / HALF_LIFE)
 *   velocity = totalEngagement / max(ageHours, 1)
 *   finalScore = (rawScore * decayFactor) + (velocity * W_VELOCITY)
 *             + tagAffinityBoost + authorAffinityBoost + contentTypeBoost + jitter
 */

export interface RankingContext {
  /** For deterministic per-user jitter — prevents identical feeds for users with similar affinities */
  userId?: string;
  /** Tag affinity scores from 30-day engagement history (tag → 0-1) */
  userAffinities?: Map<string, number>;
  /** Author affinity scores from 30-day engagement history (authorId → 0-1) */
  authorAffinities?: Map<string, number>;
  /** Content-type preference scores from 30-day engagement history (contentType → 0-1) */
  contentTypePrefs?: Map<string, number>;
}

interface FeedItem {
  id: string;
  content_type: 'post' | 'topic' | 'nook_message';
  content_id: string;
  user_id: string;
  author: {
    display_name: string;
    bio: string | null;
    avatar?: string;
  };
  content: any;
  engagement: {
    likes: number;
    comments: number;
    shares?: number;
    seen?: number;
  };
  created_at: string;
  user_liked?: boolean;
  user_shared?: boolean;
  user_bookmarked?: boolean;
}

interface RankedFeedItem extends FeedItem {
  engagement_score: number;
}

// Engagement signal weights
const WEIGHTS = {
  LIKE: 1.0,
  COMMENT: 3.0,   // Comments take effort — strongest organic signal
  SHARE: 5.0,     // Shares = active endorsement
  VIEW: 0.1,      // Passive, low weight
};

// Time decay half-life in hours.
const HALF_LIFE_HOURS = 24;

// Velocity bonus weight — rewards posts gaining engagement quickly.
const VELOCITY_WEIGHT = 2.0;

// Minimum age (hours) to avoid division by zero for brand-new posts.
const MIN_AGE_HOURS = 0.5;

// Max items from the same author per page (diversity cap)
const MAX_ITEMS_PER_AUTHOR = 2;

// Content type share caps per page (sum > 1.0 to allow fill-up when one type is sparse)
const DIVERSITY_CAPS = {
  post: 0.45,
  topic: 0.45,
  nook_message: 0.20,
};

@Injectable()
export class FeedRankingService {
  /**
   * Twitter-inspired trending algorithm.
   * Only considers content from the last 7 days.
   * Scores based on engagement velocity + acceleration.
   */
  private static readonly TRENDING_WINDOW_DAYS = 7;
  private static readonly ACCELERATION_WINDOW_HOURS = 24;

  rankByTrending(items: FeedItem[]): RankedFeedItem[] {
    if (items.length === 0) return [];

    const now = Date.now();
    const windowMs = FeedRankingService.TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const recentItems = items.filter(
      (item) => now - new Date(item.created_at).getTime() < windowMs,
    );

    if (recentItems.length === 0) return [];

    const scored = recentItems.map((item) => {
      const score = this.calculateTrendingScore(item, now);
      return { ...item, engagement_score: score };
    });

    scored.sort((a, b) => b.engagement_score - a.engagement_score);
    return scored;
  }

  private calculateTrendingScore(item: FeedItem, now: number): number {
    const likes = item.engagement.likes || 0;
    const comments = item.engagement.comments || 0;
    const shares = item.engagement.shares || 0;

    const totalEngagement = likes + comments * 3 + shares * 5;

    const ageMs = now - new Date(item.created_at).getTime();
    const ageHours = Math.max(ageMs / (1000 * 60 * 60), 0.5);

    const velocity = totalEngagement / ageHours;

    const accelWindowHours = FeedRankingService.ACCELERATION_WINDOW_HOURS;
    let acceleration = 1.0;

    if (ageHours <= accelWindowHours) {
      acceleration = totalEngagement > 0 ? 1.5 : 0.5;
    } else {
      const baselineRate = totalEngagement / ageHours;
      const engagementDensity = totalEngagement / Math.sqrt(ageHours);
      acceleration = engagementDensity > baselineRate ? 1.2 : 0.8;
    }

    const freshnessBonus = 1 / (1 + ageHours / 48);
    const trendingScore = velocity * acceleration * (1 + freshnessBonus);

    return Math.round(trendingScore * 100) / 100;
  }

  /**
   * Rank items by personalised engagement score.
   * Each user gets a different ordering because of:
   *   - tag affinity  (boosts content matching their engagement patterns)
   *   - author affinity  (boosts content from authors they engage with)
   *   - content-type preference  (boosts their preferred content type)
   *   - deterministic jitter  (prevents identical feeds for users with similar profiles)
   *   - cold-start mode  (for new users with no history — freshness-first)
   */
  rankByEngagement(items: FeedItem[], context: RankingContext = {}): RankedFeedItem[] {
    if (items.length === 0) return [];

    const now = Date.now();
    const isColdStart = !context.userAffinities || context.userAffinities.size === 0;

    const scored = items.map((item) => {
      const score = this.calculateScore(item, now, context, isColdStart);
      return { ...item, engagement_score: score };
    });

    scored.sort((a, b) => b.engagement_score - a.engagement_score);
    return scored;
  }

  /**
   * Re-score and re-sort a ranked feed to suppress items the user has already seen.
   * Seen items are NOT removed — they just rank lower.
   * seenMap: content_id → number of times seen (1 = seen once this session).
   *
   * Each view halves the effective score:
   *   suppressedScore = originalScore / (1 + seenCount * 0.5)
   */
  applySuppression(items: RankedFeedItem[], seenMap: Map<string, number>): RankedFeedItem[] {
    if (seenMap.size === 0) return items;

    const suppressed = items.map((item) => {
      const seenCount = seenMap.get(item.content_id) || 0;
      if (seenCount === 0) return item;
      const suppressionFactor = 1 / (1 + seenCount * 0.5);
      return { ...item, engagement_score: item.engagement_score * suppressionFactor };
    });

    suppressed.sort((a, b) => b.engagement_score - a.engagement_score);
    return suppressed;
  }

  /**
   * Apply content diversity constraints to a ranked list:
   *   - Max 2 items per author (prevents any one author dominating the feed)
   *   - Content type caps: posts 45%, topics 45%, nooks 20%
   *
   * If there aren't enough items to satisfy type caps (e.g. very few nooks),
   * the type cap is relaxed while the author cap is always enforced.
   *
   * @param items  Sorted ranked items (best first)
   * @param limit  Total number of items needed (e.g. page * pageSize for multi-page consistency)
   */
  applyDiversityConstraints(items: RankedFeedItem[], limit: number): RankedFeedItem[] {
    if (items.length === 0) return [];

    const maxPerType: Record<string, number> = {
      post: Math.ceil(limit * DIVERSITY_CAPS.post),
      topic: Math.ceil(limit * DIVERSITY_CAPS.topic),
      nook_message: Math.ceil(limit * DIVERSITY_CAPS.nook_message),
    };

    const typeCounts: Record<string, number> = { post: 0, topic: 0, nook_message: 0 };
    const authorCounts = new Map<string, number>();
    const result: RankedFeedItem[] = [];
    const skipped: RankedFeedItem[] = [];

    for (const item of items) {
      if (result.length >= limit) break;

      const type = item.content_type;
      const authorId = item.user_id;
      const authorCount = authorCounts.get(authorId) || 0;

      // Always enforce author cap
      if (authorCount >= MAX_ITEMS_PER_AUTHOR) {
        skipped.push(item);
        continue;
      }

      // Check type cap
      if ((typeCounts[type] || 0) >= (maxPerType[type] || limit)) {
        skipped.push(item);
        continue;
      }

      result.push(item);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      authorCounts.set(authorId, authorCount + 1);
    }

    // Fill remaining slots from skipped items — relax type cap but keep author cap
    if (result.length < limit) {
      for (const item of skipped) {
        if (result.length >= limit) break;
        const authorId = item.user_id;
        const authorCount = authorCounts.get(authorId) || 0;
        if (authorCount >= MAX_ITEMS_PER_AUTHOR) continue;
        result.push(item);
        authorCounts.set(authorId, authorCount + 1);
      }
    }

    return result;
  }

  private calculateScore(
    item: FeedItem,
    now: number,
    context: RankingContext,
    isColdStart: boolean,
  ): number {
    const likes = item.engagement.likes || 0;
    const comments = item.engagement.comments || 0;
    const shares = item.engagement.shares || 0;
    const views = item.engagement.seen || 0;

    // 1. Weighted raw engagement score
    const rawScore =
      likes * WEIGHTS.LIKE +
      comments * WEIGHTS.COMMENT +
      shares * WEIGHTS.SHARE +
      views * WEIGHTS.VIEW;

    // 2. Time decay — older content scores lower
    const ageMs = now - new Date(item.created_at).getTime();
    const ageHours = Math.max(ageMs / (1000 * 60 * 60), MIN_AGE_HOURS);
    const decayFactor = 1 / (1 + ageHours / HALF_LIFE_HOURS);

    // 3. Velocity — engagement per hour (trending signal)
    const totalEngagement = likes + comments + shares;
    const velocity = totalEngagement / ageHours;
    const velocityBonus = velocity * VELOCITY_WEIGHT;

    // 4. Deterministic per-user jitter
    //    Prevents two users with similar affinity profiles from getting the identical ranked feed.
    //    Uses a hash of (userId + contentId) so the same user always sees the same order
    //    within a cache window, but different users see different orderings.
    const jitter = context.userId
      ? (this.simpleHash(context.userId + item.content_id) % 100) / 1000
      : 0;

    // Cold-start: no engagement history — favour fresh diverse content + stronger jitter
    if (isColdStart) {
      const freshnessFactor = Math.exp(-ageHours / 48);
      const coldStartBoost = rawScore * 0.1 + freshnessFactor * 10;
      const coldJitter = context.userId
        ? (this.simpleHash(context.userId + item.content_id) % 100) / 200
        : 0;
      return Math.round((rawScore * decayFactor + velocityBonus + coldStartBoost + coldJitter) * 100) / 100;
    }

    // 5. Tag affinity boost — content matching user's engaged topics
    let tagAffinityBoost = 0;
    if (context.userAffinities && context.userAffinities.size > 0) {
      const itemTags: string[] = item.content?.tags || [];
      let affinitySum = 0;
      itemTags.forEach((tag) => {
        const affinity = context.userAffinities!.get(tag);
        if (affinity) affinitySum += affinity;
      });
      // Cap at 30% of raw score
      tagAffinityBoost = Math.min(affinitySum * 5, rawScore * 0.3);
    }

    // 6. Author affinity boost — content from authors the user frequently engages with
    let authorAffinityBoost = 0;
    if (context.authorAffinities && context.authorAffinities.size > 0) {
      const authorAffinity = context.authorAffinities.get(item.user_id) || 0;
      // Cap at 20% of raw score
      authorAffinityBoost = Math.min(authorAffinity * 8, rawScore * 0.2);
    }

    // 7. Content-type preference boost — favour the type the user most engages with
    let contentTypeBoost = 0;
    if (context.contentTypePrefs && context.contentTypePrefs.size > 0) {
      const typeAffinity = context.contentTypePrefs.get(item.content_type) || 0;
      // Cap at 15% of raw score
      contentTypeBoost = Math.min(typeAffinity * 3, rawScore * 0.15);
    }

    // 8. Final composite score
    const finalScore =
      rawScore * decayFactor +
      velocityBonus +
      tagAffinityBoost +
      authorAffinityBoost +
      contentTypeBoost +
      jitter;

    return Math.round(finalScore * 100) / 100;
  }

  /**
   * Fast non-cryptographic hash for deterministic per-user jitter.
   * Same input always returns the same number (djb2-style).
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
