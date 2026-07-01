/**
 * Data access for the coaching agent — raw Azure Postgres via the shared `pg`
 * pool (getPool), with parameterized SQL only. No Supabase, no ORM at runtime.
 *
 * Encrypted columns (content_encrypted, focus_encrypted, etc.) are encrypted/
 * decrypted here with the existing EncryptionUtil so coaching content is stored
 * at rest the same way the rest of the platform stores PII and messages.
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { getPool } from '../../../database/pg-client';
import { EncryptionUtil } from '../../../common/utils/encryption.util';
import {
  CoachModality,
  CoachRole,
  CoachSession,
  CoachStage,
  CoachTurn,
  Engagement,
  SafetyResult,
} from '../interfaces/coaching.types';

@Injectable()
export class CoachRepositoryService {
  private readonly pool: Pool;

  constructor(private readonly crypto: EncryptionUtil) {
    this.pool = getPool();
  }

  private enc(v: string | null): string | null {
    return v == null || v === '' ? null : this.crypto.encrypt(v);
  }

  private dec(v: string | null): string | null {
    if (v == null || v === '') return null;
    try {
      return this.crypto.decrypt(v);
    } catch {
      return null;
    }
  }

  // ─── Engagements ───────────────────────────────────────────────────────────

  /** Get the user's active engagement, or create one if none exists. */
  async getOrCreateEngagement(userId: string): Promise<Engagement> {
    const cols = `id, user_id, status, focus_encrypted, current_stage,
                  semantic_summary_encrypted, profile_encrypted,
                  profile_refreshed_at, consent_collect, consent_share`;
    const found = await this.pool.query(
      `SELECT ${cols}
         FROM coaching_engagements
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    if (found.rows[0]) return this.mapEngagement(found.rows[0]);

    const created = await this.pool.query(
      `INSERT INTO coaching_engagements (user_id)
       VALUES ($1)
       RETURNING ${cols}`,
      [userId],
    );
    return this.mapEngagement(created.rows[0]);
  }

  async setConsent(
    engagementId: string,
    collect: boolean,
    share: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_engagements
          SET consent_collect = $2, consent_share = $3, updated_at = now()
        WHERE id = $1`,
      [engagementId, collect, share],
    );
  }

  async updateEngagementStage(
    engagementId: string,
    stage: CoachStage,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_engagements
          SET current_stage = $2, updated_at = now()
        WHERE id = $1`,
      [engagementId, stage],
    );
  }

  async setEngagementFocus(
    engagementId: string,
    focus: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_engagements
          SET focus_encrypted = $2, updated_at = now()
        WHERE id = $1 AND focus_encrypted IS NULL`,
      [engagementId, this.enc(focus)],
    );
  }

  async saveProfile(engagementId: string, profile: string): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_engagements
          SET profile_encrypted = $2, profile_refreshed_at = now(), updated_at = now()
        WHERE id = $1`,
      [engagementId, this.enc(profile)],
    );
  }

  /** True if this engagement has any session other than the given one. */
  async hasPriorSessions(
    engagementId: string,
    excludeSessionId: string,
  ): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM coaching_sessions
        WHERE engagement_id = $1 AND id <> $2 LIMIT 1`,
      [engagementId, excludeSessionId],
    );
    return res.rowCount! > 0;
  }

  private mapEngagement(row: any): Engagement {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      focus: this.dec(row.focus_encrypted),
      currentStage: row.current_stage as CoachStage,
      semanticSummary: this.dec(row.semantic_summary_encrypted),
      profile: this.dec(row.profile_encrypted),
      profileRefreshedAt: row.profile_refreshed_at
        ? new Date(row.profile_refreshed_at).toISOString()
        : null,
      consentCollect: row.consent_collect,
      consentShare: row.consent_share,
    };
  }

  /**
   * The user's real first name to address them by, or null if they don't have
   * one. We deliberately do NOT fall back to the anonymous username/handle —
   * "Hello aaliyahw100" reads like a machine; a nameless warm greeting is better.
   */
  async getClientName(userId: string): Promise<string | null> {
    const res = await this.pool.query(
      `SELECT first_name_encrypted FROM user_profiles WHERE id = $1`,
      [userId],
    );
    const name = (this.dec(res.rows[0]?.first_name_encrypted ?? null) || '')
      .trim()
      .slice(0, 60);
    return name.length > 0 ? name : null;
  }

  /** The user's anonymous handle (username) — used to identify them on a ticket. */
  async getClientHandle(userId: string): Promise<string | null> {
    const res = await this.pool.query(
      `SELECT username FROM user_profiles WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.username ?? null;
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async createSession(
    engagementId: string,
    userId: string,
    stage: CoachStage,
    modality: CoachModality,
  ): Promise<CoachSession> {
    const res = await this.pool.query(
      `INSERT INTO coaching_sessions (engagement_id, user_id, stage, modality)
       VALUES ($1, $2, $3, $4)
       RETURNING id, engagement_id, user_id, status, stage, modality, goal_encrypted`,
      [engagementId, userId, stage, modality],
    );
    return this.mapSession(res.rows[0]);
  }

  async getSession(sessionId: string): Promise<CoachSession | null> {
    const res = await this.pool.query(
      `SELECT id, engagement_id, user_id, status, stage, modality
         FROM coaching_sessions WHERE id = $1`,
      [sessionId],
    );
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  async updateSessionStage(
    sessionId: string,
    stage: CoachStage,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_sessions SET stage = $2 WHERE id = $1`,
      [sessionId, stage],
    );
  }

  /** Re-open a session that was ended (inactivity/close) so it can be resumed. */
  async reactivateSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_sessions
          SET status = 'active', closed_at = NULL
        WHERE id = $1`,
      [sessionId],
    );
  }

  /** The user's most recent session (any status), for resume. */
  async getLatestSession(userId: string): Promise<CoachSession | null> {
    const res = await this.pool.query(
      `SELECT id, engagement_id, user_id, status, stage, modality
         FROM coaching_sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  /** Whether a crisis was ever flagged in this session (excluded from resume). */
  async sessionHadCrisis(sessionId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM coaching_safety_events
        WHERE session_id = $1 AND category IN ('SELF_HARM','CRISIS') LIMIT 1`,
      [sessionId],
    );
    return res.rowCount! > 0;
  }

  async completeSession(
    sessionId: string,
    summary: string | null,
    commitment: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_sessions
          SET status = 'completed',
              closed_at = now(),
              summary_encrypted = COALESCE($2, summary_encrypted),
              commitment_encrypted = COALESCE($3, commitment_encrypted)
        WHERE id = $1`,
      [sessionId, this.enc(summary), this.enc(commitment)],
    );
  }

  /** A short recap of the most recent completed session in this engagement. */
  async getLastSessionRecap(
    engagementId: string,
    excludeSessionId: string,
  ): Promise<string | null> {
    const res = await this.pool.query(
      `SELECT summary_encrypted
         FROM coaching_sessions
        WHERE engagement_id = $1
          AND id <> $2
          AND status = 'completed'
          AND summary_encrypted IS NOT NULL
        ORDER BY closed_at DESC NULLS LAST
        LIMIT 1`,
      [engagementId, excludeSessionId],
    );
    return res.rows[0] ? this.dec(res.rows[0].summary_encrypted) : null;
  }

  private mapSession(row: any): CoachSession {
    return {
      id: row.id,
      engagementId: row.engagement_id,
      userId: row.user_id,
      status: row.status,
      stage: row.stage as CoachStage,
      modality: row.modality as CoachModality,
      goal: this.dec(row.goal_encrypted ?? null),
    };
  }

  /** Persist/refine the agreed session goal (model [GOAL:] overrides the provisional). */
  async setSessionGoal(sessionId: string, goal: string): Promise<void> {
    await this.pool.query(
      `UPDATE coaching_sessions SET goal_encrypted = $2 WHERE id = $1`,
      [sessionId, this.enc(goal)],
    );
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  async addMessage(
    sessionId: string,
    engagementId: string,
    role: CoachRole,
    content: string,
    stage: CoachStage,
    modality: CoachModality,
  ): Promise<string> {
    // content_encrypted is NOT NULL; never let an empty message reach the DB.
    const safeContent = content && content.trim() ? content : ' ';
    const res = await this.pool.query(
      `INSERT INTO coaching_messages
         (session_id, engagement_id, role, content_encrypted, stage, modality)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [sessionId, engagementId, role, this.enc(safeContent), stage, modality],
    );
    return res.rows[0].id;
  }

  /** Decrypted turns for a session, oldest first, capped to `limit` most recent. */
  async getTurns(sessionId: string, limit = 20): Promise<CoachTurn[]> {
    const res = await this.pool.query(
      `SELECT role, content_encrypted, stage
         FROM coaching_messages
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [sessionId, limit],
    );
    return res.rows
      .reverse()
      .map((r: any) => ({
        role: r.role as CoachRole,
        content: this.dec(r.content_encrypted) ?? '',
        stage: r.stage as CoachStage,
      }))
      .filter((t: CoachTurn) => t.content.length > 0);
  }

  /** How many client turns have occurred in this session at the given stage. */
  async countClientTurnsInStage(
    sessionId: string,
    stage: CoachStage,
  ): Promise<number> {
    const res = await this.pool.query(
      `SELECT count(*)::int AS n
         FROM coaching_messages
        WHERE session_id = $1 AND role = 'client' AND stage = $2`,
      [sessionId, stage],
    );
    return res.rows[0]?.n ?? 0;
  }

  // ─── Commitments ───────────────────────────────────────────────────────────

  async addCommitment(
    engagementId: string,
    sessionId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO coaching_commitments
         (engagement_id, session_id, user_id, content_encrypted)
       VALUES ($1, $2, $3, $4)`,
      [engagementId, sessionId, userId, this.enc(content)],
    );
  }

  // ─── Feedback + self-learning ──────────────────────────────────────────────

  async countClientTurns(sessionId: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT count(*)::int AS n FROM coaching_messages
        WHERE session_id = $1 AND role = 'client'`,
      [sessionId],
    );
    return res.rows[0]?.n ?? 0;
  }

  async hasFeedback(sessionId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM coaching_feedback WHERE session_id = $1 LIMIT 1`,
      [sessionId],
    );
    return res.rowCount! > 0;
  }

  async addFeedback(
    sessionId: string,
    userId: string,
    rating: number,
    comment: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO coaching_feedback (session_id, user_id, rating, comment_encrypted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, userId, rating, this.enc(comment)],
    );
  }

  async addLearning(lesson: string, sourceRating: number | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO coaching_learnings (lesson_encrypted, source_rating)
       VALUES ($1, $2)`,
      [this.enc(lesson), sourceRating],
    );
  }

  async getRecentLearnings(limit = 5): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT lesson_encrypted FROM coaching_learnings
        WHERE is_active = true
        ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows
      .map((r: any) => this.dec(r.lesson_encrypted))
      .filter((s: string | null): s is string => !!s);
  }

  /** Curated, weighted rulebook entries (decrypted), highest weight first. */
  async getActiveRules(limit = 8): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT rule_encrypted FROM coaching_rulebook
        WHERE is_active = true
        ORDER BY weight DESC, created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows
      .map((r: any) => this.dec(r.rule_encrypted))
      .filter((s: string | null): s is string => !!s);
  }

  /** All raw distilled lessons (decrypted) for the consolidation pass. */
  async getRawLessonsForConsolidation(limit = 300): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT lesson_encrypted FROM coaching_learnings
        WHERE is_active = true
        ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows
      .map((r: any) => this.dec(r.lesson_encrypted))
      .filter((s: string | null): s is string => !!s);
  }

  /** Current rulebook with weights, for the consolidation pass. */
  async getCurrentRulebook(): Promise<{ rule: string; weight: number }[]> {
    const res = await this.pool.query(
      `SELECT rule_encrypted, weight FROM coaching_rulebook
        WHERE is_active = true ORDER BY weight DESC`,
    );
    const out: { rule: string; weight: number }[] = [];
    for (const r of res.rows as any[]) {
      const rule = this.dec(r.rule_encrypted);
      if (rule) out.push({ rule, weight: Number(r.weight) || 1 });
    }
    return out;
  }

  /** Atomically swap the active rulebook for a freshly consolidated set. */
  async replaceRulebook(
    rules: { rule: string; weight: number }[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE coaching_rulebook SET is_active = false WHERE is_active = true`,
      );
      for (const r of rules) {
        await client.query(
          `INSERT INTO coaching_rulebook (rule_encrypted, weight)
           VALUES ($1, $2)`,
          [this.enc(r.rule), Math.max(1, Math.round(r.weight || 1))],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Safety events (tamper-evident audit log) ──────────────────────────────

  /**
   * Create an admin-only safety support ticket (harm to self/others) with the
   * full transcript + the user's handle. Returns the reference number.
   */
  async createSupportTicket(params: {
    userId: string;
    handle: string | null;
    category: string;
    severity: string;
    sessionId: string | null;
    transcript: string;
  }): Promise<string> {
    const ref =
      'SAFE-' +
      Math.abs(this.hashRef(params.userId + params.sessionId))
        .toString(36)
        .toUpperCase()
        .slice(0, 6) +
      '-' +
      (await this.nextTicketSuffix());
    await this.pool.query(
      `INSERT INTO coaching_support_tickets
         (reference_number, user_id, handle, category, severity, session_id, transcript_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ref,
        params.userId,
        params.handle,
        params.category,
        params.severity,
        params.sessionId,
        this.enc(params.transcript),
      ],
    );
    return ref;
  }

  /** Admin: safety classifier-vs-regex disagreement log + summary counts. */
  async listSafetyEvals(limit = 100): Promise<{
    counts: { classifier_miss: number; regex_gap: number };
    items: any[];
  }> {
    const [counts, rows] = await Promise.all([
      this.pool.query(
        `SELECT kind, count(*)::int AS n FROM coaching_safety_evals GROUP BY kind`,
      ),
      this.pool.query(
        `SELECT kind, regex_category, classifier_category, classifier_severity,
                message_encrypted, created_at
           FROM coaching_safety_evals ORDER BY created_at DESC LIMIT $1`,
        [limit],
      ),
    ]);
    const c = { classifier_miss: 0, regex_gap: 0 };
    counts.rows.forEach((r: any) => {
      if (r.kind in c) (c as any)[r.kind] = r.n;
    });
    return {
      counts: c,
      items: rows.rows.map((r: any) => ({
        kind: r.kind,
        regexCategory: r.regex_category,
        classifierCategory: r.classifier_category,
        classifierSeverity: r.classifier_severity,
        message: this.dec(r.message_encrypted),
        createdAt: r.created_at,
      })),
    };
  }

  /** Admin: list safety support tickets, newest first, with decrypted transcript. */
  async listSupportTickets(limit = 100): Promise<any[]> {
    const res = await this.pool.query(
      `SELECT reference_number, user_id, handle, category, severity, status,
              session_id, transcript_encrypted, created_at
         FROM coaching_support_tickets
        ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r: any) => ({
      reference: r.reference_number,
      userId: r.user_id,
      handle: r.handle,
      category: r.category,
      severity: r.severity,
      status: r.status,
      sessionId: r.session_id,
      createdAt: r.created_at,
      transcript: this.dec(r.transcript_encrypted),
    }));
  }

  private hashRef(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  /** Short, collision-resistant suffix based on the current ticket count. */
  private async nextTicketSuffix(): Promise<string> {
    const res = await this.pool.query(
      `SELECT count(*)::int AS n FROM coaching_support_tickets`,
    );
    return String((res.rows[0]?.n ?? 0) + 1).padStart(5, '0');
  }

  /**
   * Log a disagreement between the regex floor and the LLM classifier so the
   * classifier's recall can be measured over time. 'classifier_miss' = regex
   * flagged but classifier did not (a recall failure to investigate);
   * 'regex_gap' = classifier flagged what the regex could not (expected).
   */
  async logSafetyEval(params: {
    sessionId: string | null;
    kind: 'classifier_miss' | 'regex_gap';
    regexCategory: string | null;
    classifierCategory: string | null;
    classifierSeverity: string | null;
    message: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO coaching_safety_evals
         (session_id, kind, regex_category, classifier_category, classifier_severity, message_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.sessionId,
        params.kind,
        params.regexCategory,
        params.classifierCategory,
        params.classifierSeverity,
        this.enc(params.message.slice(0, 2000)),
      ],
    );
  }

  async logSafetyEvent(
    userId: string,
    sessionId: string | null,
    safety: SafetyResult,
    action: 'redirect' | 'referral' | 'none',
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO coaching_safety_events
         (user_id, session_id, category, severity, action)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, sessionId, safety.category, safety.severity, action],
    );
  }
}
