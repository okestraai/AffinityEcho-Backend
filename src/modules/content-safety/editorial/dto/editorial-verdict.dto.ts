export type Verdict = 'allow' | 'hide' | 'remove' | 'escalate';
export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface EditorialVerdict {
  verdict: Verdict;
  confidence: number;
  severity: Severity;
  categories: string[];
  rationale: string;
  userFacingReason: string | null;
}

export interface EnforcementResult {
  action: 'allow' | 'hide' | 'remove';
  moderationStatus: string; // written to content_moderation
  needsReview: boolean;
  reviewPriority: 'urgent' | 'high' | 'normal' | 'low';
  reviewReason: string;
  sendSafetyDm: boolean;
}
