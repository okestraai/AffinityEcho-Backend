/**
 * CoachLearningService — Coach's self-learning loop.
 *
 *   feedback  → distill()      → one raw, generalisable lesson  (coaching_learnings)
 *   nightly   → consolidate()  → deduped, weighted rulebook      (coaching_rulebook)
 *   each turn → getRules()     → top rules injected into the coaching prompt
 *
 * All distillation/consolidation runs on the private vLLM, and every lesson is a
 * general, non-identifying coaching rule — never verbatim user content.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CoachRepositoryService } from './coach-repository.service';
import { CoachLlmRouterService } from './coach-llm-router.service';

const DISTILL_PROMPT = `You improve an AI coach from user feedback. Given a star rating and an optional comment about one coaching session, distill ONE short, generalisable lesson the coach should apply in FUTURE sessions with ANY user.

Rules:
- Output a single specific, actionable imperative (max 25 words) that names a concrete behaviour change, e.g. "When a user says they're stuck, offer a concrete suggestion instead of asking another question."
- It must be general and reusable — never reference this specific user, name, company, or situation. No personal data.
- Do NOT output generic platitudes ("be respectful", "use clear language", "be empathetic") — only specific, non-obvious coaching behaviours grounded in the feedback.
- The coach already avoids parroting the user's words back; never produce a lesson telling it to paraphrase or restate what the user said.
- If there is no useful, specific lesson, output exactly: NONE
- Plain text only.`;

const CONSOLIDATE_PROMPT = `You maintain the canonical RULEBOOK for an AI coach, improving it from user feedback. You are given the current rules (with weights) and recent raw lessons distilled from individual feedback. Merge everything into one clean, prioritized rulebook.

Rules:
- Combine duplicates and paraphrases into a SINGLE rule; add up their support into "weight" (an integer count of how many inputs back it).
- Each rule is a short, SPECIFIC, actionable imperative (max 25 words) that names a concrete behaviour. No user-specific or identifying content.
- Drop vague, contradictory, redundant, or low-value items, and drop generic platitudes ("be respectful", "use clear language", "be empathetic", "ask open questions").
- The coach already avoids parroting the user's words; never keep a rule telling it to paraphrase or restate what the user said.
- Keep at most 10 high-signal rules, highest weight first. Fewer strong rules beat many weak ones.
- Output ONLY valid JSON, no prose: {"rules":[{"rule":"...","weight":3}, ...]}`;

@Injectable()
export class CoachLearningService {
  private readonly logger = new Logger(CoachLearningService.name);

  constructor(
    private readonly repo: CoachRepositoryService,
    private readonly llm: CoachLlmRouterService,
  ) {}

  /**
   * The rules the coach should follow: the curated rulebook if it exists, else
   * a fallback to the most recent raw lessons (so the loop works before the
   * first nightly consolidation).
   */
  async getRules(limit = 8): Promise<string[]> {
    const rules = await this.repo.getActiveRules(limit);
    if (rules.length > 0) return rules;
    return this.repo.getRecentLearnings(limit);
  }

  /** Distil one piece of feedback into a raw lesson. Fire-and-forget safe. */
  async distill(rating: number, comment: string | null): Promise<void> {
    try {
      const input =
        `Star rating: ${rating}/5.` +
        (comment ? ` User comment: "${comment.slice(0, 800)}"` : '');
      const lesson = await this.llm.vllmComplete(DISTILL_PROMPT, input, {
        maxTokens: 120,
        temperature: 0.2,
      });
      const clean = (lesson || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
      if (clean.length > 8 && !/^none\b/i.test(clean)) {
        await this.repo.addLearning(clean.slice(0, 400), rating);
      }
    } catch (err) {
      this.logger.warn(`Distillation failed: ${String(err)}`);
    }
  }

  /**
   * Rebuild the canonical rulebook from the current rules + recent raw lessons:
   * dedup paraphrases, sum support into weights, cap and prioritise. Returns the
   * number of rules in the new rulebook (0 if nothing to do / on failure).
   */
  async consolidate(): Promise<number> {
    try {
      const [current, raw] = await Promise.all([
        this.repo.getCurrentRulebook(),
        this.repo.getRawLessonsForConsolidation(300),
      ]);
      if (current.length === 0 && raw.length === 0) return 0;

      const payload = JSON.stringify({
        currentRules: current,
        rawLessons: raw,
      });
      const out = await this.llm.vllmComplete(CONSOLIDATE_PROMPT, payload, {
        maxTokens: 900,
        temperature: 0.2,
      });

      const rules = this.parseRules(out);
      if (rules.length === 0) {
        this.logger.warn('Consolidation produced no rules; keeping current.');
        return current.length;
      }
      await this.repo.replaceRulebook(rules);
      this.logger.log(`Rulebook consolidated to ${rules.length} rules.`);
      return rules.length;
    } catch (err) {
      this.logger.warn(`Consolidation failed: ${String(err)}`);
      return 0;
    }
  }

  private parseRules(raw: string): { rule: string; weight: number }[] {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return [];
    let parsed: any;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed?.rules)) return [];
    return parsed.rules
      .map((r: any) => ({
        rule: String(r?.rule || '').trim(),
        weight: Number.isFinite(r?.weight) ? Math.round(r.weight) : 1,
      }))
      .filter((r: { rule: string }) => r.rule.length > 4)
      .slice(0, 12);
  }
}
