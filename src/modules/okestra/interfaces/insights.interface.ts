export type ContentType = 'topic' | 'nook';

export interface OkestraInsightsResult {
  tldr: string;
  overallSentiment: string;
  keyThemes: string[];
  themes: {
    name: string;
    sentiment: 'Positive' | 'Neutral' | 'Negative';
    supportingCommentIds: string[];
  }[];
  actionItems: {
    action: string;
    rationale: string;
    nextSteps: string[];
    confidence: 'Low' | 'Med' | 'High';
    category: string;
  }[];
  safetyFlags: string[];
}

export interface CachedInsights {
  insights: OkestraInsightsResult;
  contentHash: string;
  generatedAt: string;
  contentType: ContentType;
  contentId: string;
}

export interface InsightsJobPayload {
  contentType: ContentType;
  contentId: string;
  contentHash: string;
}
