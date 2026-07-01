/**
 * The GROW coaching state machine (Goal → Reality → Options → Will), wrapped by
 * a soft OPENING (follow-up on last time) and a CLOSING (lock a commitment).
 *
 * "Flow engineering": each stage gives the model a narrow, different job with its
 * own guardrails. The machine here only governs *legal transitions*; the model
 * fills the local decision of when to move on by emitting [STAGE:x].
 */
import { CoachStage } from '../interfaces/coaching.types';

const ORDER: CoachStage[] = [
  'OPENING',
  'GOAL',
  'REALITY',
  'OPTIONS',
  'WILL',
  'CLOSING',
];

/** Index of a stage in the canonical arc. */
function indexOf(stage: CoachStage): number {
  const i = ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

/** The stage that naturally follows `stage` (CLOSING stays at CLOSING). */
export function nextStage(stage: CoachStage): CoachStage {
  const i = indexOf(stage);
  return ORDER[Math.min(i + 1, ORDER.length - 1)];
}

/**
 * Validate a model-requested transition. The coach may only advance one step at
 * a time, or hold the current stage. It may never jump backwards or skip ahead
 * (which would, e.g., let it offer Options before establishing Reality). An
 * illegal request is clamped to "hold current stage".
 */
export function resolveStage(
  current: CoachStage,
  requested: CoachStage | null,
): CoachStage {
  if (!requested) return current;
  const ci = indexOf(current);
  const ri = indexOf(requested);
  if (ri === ci) return current; // hold
  if (ri === ci + 1) return requested; // advance one step — allowed
  return current; // backwards or skip-ahead — clamp
}

export function isFinalStage(stage: CoachStage): boolean {
  return stage === 'CLOSING';
}
