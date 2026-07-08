/**
 * Control-token parsing for the coaching turn engine.
 *
 * The coach LLM is instructed to append machine-readable control tokens to the
 * END of its message. The engine parses and strips them so the user only ever
 * sees clean spoken text. This is the same mechanic vettly uses with its
 * `[DONE]` token, extended for the GROW state machine.
 *
 * Recognised tokens (each on its own, at the end of the message):
 *   [STAGE:GOAL|REALITY|OPTIONS|WILL|CLOSING]  → advance the GROW stage
 *   [ADVICE_REQUEST]                            → coach is gating an observation
 *   [COMMIT: free text]                         → client-owned closing commitment
 *   [DONE]                                      → session complete
 */
import { CoachStage } from '../interfaces/coaching.types';

const STAGES: CoachStage[] = [
  'OPENING',
  'GOAL',
  'REALITY',
  'OPTIONS',
  'WILL',
  'CLOSING',
];

export interface ParsedTurn {
  /** The message with all control tokens removed, trimmed. */
  cleanText: string;
  /** A requested stage transition, if the model emitted [STAGE:x]. */
  nextStage: CoachStage | null;
  /** The model asked permission to offer an observation. */
  adviceRequest: boolean;
  /** The agreed goal/objective for this session, captured in the GOAL stage. */
  goal: string | null;
  /** A captured client commitment, if any. */
  commitment: string | null;
  /** Which kinds of in-product resource cards the coach chose to surface. */
  show: { mentors: boolean; topics: boolean; posts: boolean };
  /** The session should end. */
  done: boolean;
}

export function parseControlTokens(raw: string): ParsedTurn {
  let text = raw ?? '';

  const done = /\[DONE\]/i.test(text);
  const adviceRequest = /\[ADVICE_REQUEST\]/i.test(text);

  let nextStage: CoachStage | null = null;
  const stageMatch = text.match(/\[STAGE:\s*([A-Z]+)\s*\]/i);
  if (stageMatch) {
    const candidate = stageMatch[1].toUpperCase() as CoachStage;
    if (STAGES.includes(candidate)) {
      nextStage = candidate;
    }
  }

  const showMatch = text.match(/\[SHOW:\s*([^\]]*)\]/i);
  const showRaw = showMatch ? showMatch[1].toLowerCase() : '';
  const show = {
    mentors: /\bmentors?\b/.test(showRaw),
    topics: /\btopics?\b/.test(showRaw),
    posts: /\bposts?\b/.test(showRaw),
  };

  let commitment: string | null = null;
  const commitMatch = text.match(/\[COMMIT:\s*([\s\S]*?)\]/i);
  if (commitMatch && commitMatch[1].trim()) {
    commitment = commitMatch[1].trim();
  }

  let goal: string | null = null;
  const goalMatch = text.match(/\[GOAL:\s*([\s\S]*?)\]/i);
  if (goalMatch && goalMatch[1].trim()) {
    goal = goalMatch[1].trim();
  }

  // Strip every recognised token from the visible text, then tidy up any
  // punctuation/whitespace the removed tokens left orphaned (e.g. ", ," or ", .").
  text = text
    .replace(/\[STAGE:[^\]]*\]/gi, '')
    .replace(/\[ADVICE_REQUEST\]/gi, '')
    .replace(/\[GOAL:[^\]]*\]/gi, '')
    .replace(/\[COMMIT:[^\]]*\]/gi, '')
    .replace(/\[SHOW:[^\]]*\]/gi, '')
    .replace(/\[DONE\]/gi, '')
    // collapse a comma/semicolon/colon that now sits before sentence-ending punctuation
    .replace(/[,;:]\s*([.!?])/g, '$1')
    // collapse doubled separators like ", ," → ","
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    // remove space before punctuation
    .replace(/\s+([,.!?;:])/g, '$1')
    // collapse runs of whitespace
    .replace(/\s{2,}/g, ' ')
    // trim stray leading/trailing separators and space
    .replace(/^[\s,;:.]+/, '')
    .replace(/[\s,;:]+$/, '')
    .trim();

  return {
    cleanText: text,
    nextStage,
    adviceRequest,
    goal,
    commitment,
    show,
    done,
  };
}
