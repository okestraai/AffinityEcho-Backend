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
   * Rank an array of feed items by engagement score (descending).
   * Pinned items (if any) are kept at the top regardless of score.
   */
  rankByEngagement(items: FeedItem[]): RankedFeedItem[] {
    if (items.length === 0) return [];

    const now = Date.now();

    const scored = items.map((item) => {
      const score = this.calculateScore(item, now);
      return { ...item, engagement_score: score };
    });

    // Sort descending by score
    scored.sort((a, b) => b.engagement_score - a.engagement_score);

    return scored;
  }

  /**
   * Calculate engagement score for a single feed item.
   */
  private calculateScore(item: FeedItem, now: number): number {
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

    // 4. Final composite score
    const finalScore = rawScore * decayFactor + velocityBonus;

    return Math.round(finalScore * 100) / 100;
  }
}
