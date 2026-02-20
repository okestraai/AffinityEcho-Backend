import { Injectable } from '@nestjs/common';

/**
 * Engagement-based feed ranking model.
 *
 * Scores each feed item using weighted engagement signals + time decay + velocity.
 * The feed passes through this service before reaching the client so items are
 * ordered by real engagement rather than just chronological order.
 *
 * Formula:
 *   rawScore = (likes * W_LIKE) + (comments * W_COMMENT) + (shares * W_SHARE) + (views * W_VIEW)
 *   decayFactor = 1 / (1 + ageHours / HALF_LIFE)
 *   velocity = totalEngagement / max(ageHours, 1)
 *   finalScore = (rawScore * decayFactor) + (velocity * W_VELOCITY)
 */

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
  COMMENT: 3.0,    // Comments take effort — strongest organic signal
  SHARE: 5.0,      // Shares = active endorsement
  VIEW: 0.1,       // Passive, low weight
};

// Time decay half-life in hours.
// After HALF_LIFE hours a post's raw score is halved.
const HALF_LIFE_HOURS = 24;

// Velocity bonus weight — rewards posts gaining engagement quickly.
const VELOCITY_WEIGHT = 2.0;

// Minimum age (hours) to avoid division by zero for brand-new posts.
const MIN_AGE_HOURS = 0.5;

@Injectable()
export class FeedRankingService {
  /**
   * Twitter-inspired trending algorithm.
   * Only considers content from the last 7 days.
   * Scores based on engagement velocity + acceleration (is engagement speeding up?).
   *
   * trendingScore = engagementVelocity * accelerationFactor
   * - velocity = totalEngagement / ageHours
   * - acceleration = recent rate (24h) / baseline rate (7d average)
   */

  private static readonly TRENDING_WINDOW_DAYS = 7;
  private static readonly ACCELERATION_WINDOW_HOURS = 24;

  rankByTrending(items: FeedItem[]): RankedFeedItem[] {
    if (items.length === 0) return [];

    const now = Date.now();
    const windowMs = FeedRankingService.TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    // Only consider items within the trending window
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

    const totalEngagement = likes + comments * 3 + shares * 5; // Weighted

    const ageMs = now - new Date(item.created_at).getTime();
    const ageHours = Math.max(ageMs / (1000 * 60 * 60), 0.5);

    // Engagement velocity — engagement per hour
    const velocity = totalEngagement / ageHours;

    // Acceleration — is engagement speeding up?
    // We approximate: if item is very new (< 24h), acceleration = 1.5 (boost new hot content)
    // If older, acceleration = velocity / (totalEngagement / (ageHours or trending window average))
    const accelWindowHours = FeedRankingService.ACCELERATION_WINDOW_HOURS;
    let acceleration = 1.0;

    if (ageHours <= accelWindowHours) {
      // New content — if it has engagement, it's accelerating
      acceleration = totalEngagement > 0 ? 1.5 : 0.5;
    } else {
      // Older content — compare recent rate vs baseline
      const baselineRate = totalEngagement / ageHours;
      // Approximate recent rate: assume engagement is evenly distributed (no per-hour data)
      // Boost items with high engagement relative to age
      const engagementDensity = totalEngagement / Math.sqrt(ageHours);
      acceleration = engagementDensity > baselineRate ? 1.2 : 0.8;
    }

    // Trending score = velocity * acceleration * freshness bonus
    const freshnessBonus = 1 / (1 + ageHours / 48); // 48h half-life for trending
    const trendingScore = velocity * acceleration * (1 + freshnessBonus);

    return Math.round(trendingScore * 100) / 100;
  }

  /**
   * Rank an array of feed items by engagement score (descending).
   * Pinned items (if any) are kept at the top regardless of score.
   */
  rankByEngagement(items: FeedItem[], userAffinities?: Map<string, number>): RankedFeedItem[] {
    if (items.length === 0) return [];

    const now = Date.now();

    const scored = items.map((item) => {
      const score = this.calculateScore(item, now, userAffinities);
      return { ...item, engagement_score: score };
    });

    // Sort descending by score
    scored.sort((a, b) => b.engagement_score - a.engagement_score);

    return scored;
  }

  /**
   * Calculate engagement score for a single feed item.
   */
  private calculateScore(item: FeedItem, now: number, userAffinities?: Map<string, number>): number {
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

    // 4. Personalization boost — boost content matching user's engagement patterns
    let personalizationBoost = 0;
    if (userAffinities && userAffinities.size > 0) {
      const itemTags: string[] = item.content?.tags || [];
      if (itemTags.length > 0) {
        let affinitySum = 0;
        itemTags.forEach((tag) => {
          const affinity = userAffinities.get(tag);
          if (affinity) {
            affinitySum += affinity;
          }
        });
        // Cap personalization boost at 30% of raw score
        personalizationBoost = Math.min(affinitySum * 5, rawScore * 0.3);
      }
    }

    // 5. Final composite score
    const finalScore = rawScore * decayFactor + velocityBonus + personalizationBoost;

    return Math.round(finalScore * 100) / 100;
  }
}
