/**
 * Coaching agent — shared types.
 *
 * This module is fully standalone: it does not import from any other feature
 * module. It only touches the shared Azure Postgres pool (via getPool) and the
 * existing EncryptionUtil for field-level encryption.
 */

/** The GROW coaching arc, plus a soft opening and a closing/commitment stage. */
export type CoachStage =
  | 'OPENING'
  | 'GOAL'
  | 'REALITY'
  | 'OPTIONS'
  | 'WILL'
  | 'CLOSING';

export type CoachRole = 'coach' | 'client' | 'system';

export type CoachModality = 'text' | 'voice';

export type EngagementStatus = 'active' | 'paused' | 'completed' | 'archived';

export type SessionStatus = 'active' | 'completed' | 'abandoned';

/** A single conversation turn, decrypted, as the engine reasons over it. */
export interface CoachTurn {
  role: CoachRole;
  content: string;
  stage: CoachStage;
  resources?: CoachResourceLinks;
}

/** Engagement = the ongoing relationship between a user and the AI coach. */
export interface Engagement {
  id: string;
  userId: string;
  status: EngagementStatus;
  focus: string | null; // decrypted overarching goal/topic
  currentStage: CoachStage;
  semanticSummary: string | null; // decrypted durable memory (from past sessions)
  profile: string | null; // decrypted coaching profile (from platform activity)
  profileRefreshedAt: string | null;
  consentCollect: boolean;
  consentShare: boolean;
}

/** Session = one coaching conversation within an engagement. */
export interface CoachSession {
  id: string;
  engagementId: string;
  userId: string;
  status: SessionStatus;
  stage: CoachStage;
  modality: CoachModality;
  /** The agreed goal/objective for this session (decrypted), kept in focus. */
  goal: string | null;
}

/** Real, clickable in-product resources the coach recommended this turn. */
export interface CoachResourceLinks {
  mentors: { handle: string; expertise: string; userId: string }[];
  topics: { title: string; forum: string; topicId: string }[];
  posts: { snippet: string; postId: string }[];
}

/** Result of a single client→coach turn, returned to any client (web/mobile). */
export interface TurnResult {
  sessionId: string;
  coachMessage: string;
  stage: CoachStage;
  phase: 'coach_speaking' | 'completed';
  isComplete: boolean;
  /** True when the coach asked permission to share an observation (advice gate). */
  advicePending: boolean;
  /** When the session just ended, whether to ask this user for feedback. */
  askFeedback?: boolean;
  /** Clickable in-product resources the coach recommended this turn (if any). */
  resources?: CoachResourceLinks;
  safety: SafetyResult;
}

export type SafetyCategory =
  | 'NONE'
  | 'SELF_HARM'
  | 'CRISIS'
  | 'HARASSMENT'
  | 'THREAT'
  | 'PII'
  | 'CLINICAL';

export type SafetySeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Whether the user would be better served by a human professional than the AI coach. */
export type ReferralType = 'none' | 'therapist' | 'professional';

export interface SafetyResult {
  status: 'ok' | 'flagged' | 'crisis';
  category: SafetyCategory;
  severity: SafetySeverity;
  /** When status === 'crisis', the redirect message to show instead of coaching. */
  redirectMessage?: string;
  /** Sub-crisis signal: recommend a human therapist / professional this turn. */
  referral?: ReferralType;
}
