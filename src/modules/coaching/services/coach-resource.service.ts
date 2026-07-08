/**
 * CoachResourceService — grounds the coach in REAL Affinity Echo resources the
 * user can actually access, so recommendations are true (not hallucinated).
 *
 * Given the user + the current theme it searches, read-only:
 *   • active mentors whose expertise/industries match (recommend by handle),
 *   • forum topics — prioritising the forums the user already belongs to, then
 *     platform-wide global forums (recommend by title + forum),
 *   • recent public feed posts across the platform.
 *
 * Postgres full-text search (websearch_to_tsquery) over existing tables. The
 * coach may recommend ONLY what this returns; the stance forbids inventing more.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { getPool } from '../../../database/pg-client';
import { CoachResourceLinks } from '../interfaces/coaching.types';

export interface CoachResources {
  mentors: { handle: string; expertise: string; bio: string; userId: string }[];
  topics: { title: string; forum: string; topicId: string }[];
  posts: { snippet: string; postId: string }[];
}

const EMPTY: CoachResources = { mentors: [], topics: [], posts: [] };

// Generic words that shouldn't drive matching (kept small — ts_rank sorts the rest).
const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'have', 'has', 'had', 'want',
  'wants', 'need', 'needs', 'help', 'would', 'could', 'should', 'about', 'from',
  'your', 'you', 'are', 'was', 'were', 'into', 'some', 'they', 'them', 'their',
  'what', 'when', 'where', 'which', 'will', 'been', 'being', 'just', 'like',
  'really', 'feel', 'think', 'know', 'get', 'got', 'one', 'more', 'most', 'also',
  'than', 'then', 'out', 'can', 'any', 'how', 'who', 'why', 'but', 'not', 'all',
  'looking', 'find', 'someone', 'anyone', 'people', 'person',
]);

/**
 * Turn free text into an OR full-text query. websearch_to_tsquery ANDs terms by
 * default, so a multi-word theme ("career transition mentor") would require ALL
 * words to appear and match almost nobody. We OR the meaningful keywords instead
 * and rely on ts_rank to surface the best matches first.
 */
function buildSearch(text: string): string {
  const words = (text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
    (w) => !STOP.has(w),
  );
  return [...new Set(words)].slice(0, 10).join(' or ');
}

@Injectable()
export class CoachResourceService {
  private readonly logger = new Logger(CoachResourceService.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  /** Search real, accessible resources for this user against a free-text theme. */
  async find(userId: string, query: string): Promise<CoachResources> {
    const search = buildSearch(query);
    if (!search) return EMPTY;
    try {
      const [mentors, topics, posts] = await Promise.all([
        this.mentors(userId, search),
        this.topics(userId, search),
        this.posts(search),
      ]);
      return { mentors, topics, posts };
    } catch (err) {
      this.logger.warn(`resource search failed: ${String(err)}`);
      return EMPTY;
    }
  }

  private async mentors(
    userId: string,
    q: string,
  ): Promise<CoachResources['mentors']> {
    const res = await this.pool.query(
      `SELECT id, username,
              array_to_string(mentor_expertise, ', ') AS expertise,
              left(coalesce(mentor_bio, ''), 140) AS bio
         FROM user_profiles
        WHERE is_active_mentor = true
          AND id <> $1
          AND username IS NOT NULL
          AND to_tsvector('english',
                coalesce(mentor_bio, '') || ' ' ||
                array_to_string(mentor_expertise, ' ') || ' ' ||
                array_to_string(mentor_industries, ' ') || ' ' ||
                coalesce(job_title, '')
              ) @@ websearch_to_tsquery('english', $2)
        ORDER BY ts_rank(
                   to_tsvector('english',
                     coalesce(mentor_bio, '') || ' ' ||
                     array_to_string(mentor_expertise, ' ') || ' ' ||
                     array_to_string(mentor_industries, ' ') || ' ' ||
                     coalesce(job_title, '')
                   ),
                   websearch_to_tsquery('english', $2)
                 ) DESC,
                 mentorship_sessions_completed DESC NULLS LAST
        LIMIT 3`,
      [userId, q],
    );
    return res.rows.map((r: any) => ({
      handle: r.username,
      expertise: r.expertise || '',
      bio: (r.bio || '').replace(/\s+/g, ' ').trim(),
      userId: r.id,
    }));
  }

  private async topics(
    userId: string,
    q: string,
  ): Promise<CoachResources['topics']> {
    const res = await this.pool.query(
      `SELECT t.id, t.title, f.name AS forum
         FROM forum_topics t
         JOIN forums f ON f.id = t.forum_id
        WHERE t.is_deleted = false AND t.is_hidden = false
          AND f.is_hidden = false AND f.deleted_at IS NULL
          AND (
            t.forum_id IN (SELECT forum_id FROM forum_members WHERE user_id = $1)
            OR f.is_global = true
          )
          AND to_tsvector('english',
                t.title || ' ' || t.content || ' ' || array_to_string(t.tags, ' ')
              ) @@ websearch_to_tsquery('english', $2)
        ORDER BY
          (t.forum_id IN (SELECT forum_id FROM forum_members WHERE user_id = $1)) DESC,
          ts_rank(
            to_tsvector('english', t.title || ' ' || t.content || ' ' || array_to_string(t.tags, ' ')),
            websearch_to_tsquery('english', $2)
          ) DESC,
          t.created_at DESC
        LIMIT 4`,
      [userId, q],
    );
    return res.rows.map((r: any) => ({
      title: r.title,
      forum: r.forum,
      topicId: r.id,
    }));
  }

  private async posts(q: string): Promise<CoachResources['posts']> {
    const res = await this.pool.query(
      `SELECT id, left(content, 160) AS snippet
         FROM feed_posts
        WHERE is_archived = false AND is_hidden = false AND visibility = 'global'
          AND to_tsvector('english', content || ' ' || array_to_string(tags, ' '))
              @@ websearch_to_tsquery('english', $1)
        ORDER BY (likes_count + comments_count) DESC, created_at DESC
        LIMIT 2`,
      [q],
    );
    return res.rows.map((r: any) => ({
      snippet: (r.snippet || '').replace(/\s+/g, ' ').trim(),
      postId: r.id,
    }));
  }
}

/**
 * Of the retrieved resources, return only the ones the coach actually referenced
 * in its reply — so the UI shows clickable cards for exactly what it recommended.
 */
export function pickMentioned(
  r: CoachResources,
  message: string,
): CoachResourceLinks {
  const m = message.toLowerCase();
  const mentors = r.mentors
    .filter((x) => x.handle && m.includes(x.handle.toLowerCase()))
    .map((x) => ({ handle: x.handle, expertise: x.expertise, userId: x.userId }));
  const topics = r.topics
    .filter((x) => {
      const t = x.title.toLowerCase().trim();
      if (!t) return false;
      if (m.includes(t)) return true;
      const prefix = t.slice(0, Math.min(24, t.length));
      return prefix.length >= 12 && m.includes(prefix);
    })
    .map((x) => ({ title: x.title, forum: x.forum, topicId: x.topicId }));
  const posts = r.posts
    .filter((x) => {
      const s = x.snippet.toLowerCase().slice(0, 30).trim();
      return s.length >= 15 && m.includes(s);
    })
    .map((x) => ({ snippet: x.snippet, postId: x.postId }));
  return { mentors, topics, posts };
}

/** Render retrieved resources into a prompt block, or '' if nothing was found. */
export function formatResources(r: CoachResources): string {
  const parts: string[] = [];
  if (r.mentors.length) {
    parts.push(
      'Mentors on Affinity Echo who match (recommend by their handle):\n' +
        r.mentors
          .map(
            (m) =>
              `- @${m.handle}${m.expertise ? ` — expertise: ${m.expertise}` : ''}`,
          )
          .join('\n'),
    );
  }
  if (r.topics.length) {
    parts.push(
      'Forum topics they can read (recommend by title and forum):\n' +
        r.topics.map((t) => `- "${t.title}" (in the ${t.forum} forum)`).join('\n'),
    );
  }
  if (r.posts.length) {
    parts.push(
      'Recent posts across the platform on this theme:\n' +
        r.posts.map((p) => `- ${p.snippet}`).join('\n'),
    );
  }
  return parts.join('\n\n');
}
