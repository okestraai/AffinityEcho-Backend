/**
 * CoachProfileService — builds a private "coaching profile" of a user from
 * THEIR OWN activity on Affinity Echo so the coach can tailor its guidance.
 *
 * Signals: the themes of their forum topics/comments, nook messages, and feed
 * posts; the affinity groups they belong to; and their professional context
 * (role, level, skills, stated goals). These are summarised on the self-hosted
 * vLLM, so this sensitive data never leaves your infrastructure.
 *
 * Strictly for tailoring THIS person's own coaching — never shown to anyone
 * else, never used to label or expose them. Read-only against existing tables.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { getPool } from '../../../database/pg-client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import { CoachLlmRouterService } from './coach-llm-router.service';

const PROFILE_SYSTEM_PROMPT = `You are building a PRIVATE coaching profile of ONE user from their own activity on Affinity Echo — an anonymous-first professional network for underrepresented communities in tech. This profile is used ONLY to help a coach tailor guidance for this same person. Never label, judge, diagnose, or expose them.

You are given JSON with their professional context, the affinity groups they belong to, their stated goals, and excerpts of what they have posted and engaged with.

Write a concise profile in 4 to 7 plain sentences (no markdown, no lists, no headings) covering:
- who they appear to be professionally (role, level, focus) if known,
- the recurring themes, challenges, and interests that show up across their activity,
- the communities/affinity groups they belong to and what that suggests matters to them,
- two or three coaching focus areas that would most help this person.

Be concrete, warm, and non-judgmental. If the data is thin, say briefly what little is known and keep it short. Output plain text only.`;

function snip(t: string | null | undefined, n = 240): string {
  return (t || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

@Injectable()
export class CoachProfileService {
  private readonly logger = new Logger(CoachProfileService.name);
  private readonly pool: Pool;

  constructor(
    private readonly crypto: EncryptionUtil,
    private readonly llm: CoachLlmRouterService,
  ) {
    this.pool = getPool();
  }

  private dec(v: string | null): string | null {
    if (!v) return null;
    try {
      return this.crypto.decrypt(v);
    } catch {
      return null;
    }
  }

  /** Affinity tags are stored encrypted, usually a JSON array; be tolerant. */
  private parseAffinity(decrypted: string | null): string[] {
    if (!decrypted) return [];
    try {
      const v = JSON.parse(decrypted);
      if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    } catch {
      /* not JSON */
    }
    return decrypted
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Generate the coaching profile for a user, or null if there's too little
   * activity to say anything useful. Never throws.
   */
  async generateProfile(userId: string): Promise<string | null> {
    try {
      const profRes = await this.pool.query(
        `SELECT job_title, years_experience, skills, bio, mentee_goals,
                affinity_tags_encrypted, career_level_encrypted
           FROM user_profiles WHERE id = $1`,
        [userId],
      );
      const p = profRes.rows[0] || {};

      const [topics, comments, nooks, feed] = await Promise.all([
        this.pool.query(
          `SELECT title, content, tags FROM forum_topics
            WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15`,
          [userId],
        ),
        this.pool.query(
          `SELECT content FROM forum_comments
            WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [userId],
        ),
        this.pool.query(
          `SELECT content FROM nook_messages
            WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [userId],
        ),
        this.pool.query(
          `SELECT content, tags FROM feed_posts
            WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15`,
          [userId],
        ),
      ]);

      const affinityGroups = this.parseAffinity(
        this.dec(p.affinity_tags_encrypted),
      );

      const payload = {
        profession: {
          jobTitle: p.job_title || null,
          yearsExperience: p.years_experience ?? null,
          careerLevel: this.dec(p.career_level_encrypted),
          skills: Array.isArray(p.skills) ? p.skills.slice(0, 20) : [],
          bio: snip(p.bio, 300),
        },
        affinityGroups,
        goals: snip(p.mentee_goals, 400),
        forumTopics: topics.rows.map((t: any) => ({
          title: snip(t.title, 120),
          tags: Array.isArray(t.tags) ? t.tags : [],
          excerpt: snip(t.content),
        })),
        forumComments: comments.rows
          .map((c: any) => snip(c.content))
          .filter(Boolean),
        nookMessages: nooks.rows
          .map((n: any) => snip(n.content))
          .filter(Boolean),
        feedPosts: feed.rows.map((f: any) => ({
          tags: Array.isArray(f.tags) ? f.tags : [],
          excerpt: snip(f.content),
        })),
      };

      const hasActivity =
        affinityGroups.length > 0 ||
        payload.goals.length > 0 ||
        payload.forumTopics.length > 0 ||
        payload.forumComments.length > 0 ||
        payload.nookMessages.length > 0 ||
        payload.feedPosts.length > 0 ||
        !!payload.profession.jobTitle;

      if (!hasActivity) return null;

      const profile = await this.llm.vllmComplete(
        PROFILE_SYSTEM_PROMPT,
        JSON.stringify(payload),
        { maxTokens: 320, temperature: 0.3 },
      );
      return profile?.trim() || null;
    } catch (err) {
      this.logger.warn(`Profile generation failed: ${String(err)}`);
      return null;
    }
  }
}
