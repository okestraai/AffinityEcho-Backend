import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ContentType,
  OkestraInsightsResult,
} from '../interfaces/insights.interface';

// Optimized system prompt — ~45% fewer tokens, same behavioral rules
const OKESTRA_SYSTEM_PROMPT = `You are Okestra, an AI assistant for Affinity Echo—an anonymous-first professional networking platform serving underrepresented communities in tech. Analyze discussion threads and generate actionable insights for career challenges, workplace dynamics, and professional growth.

## PLATFORM CONTEXT

Affinity Echo serves professionals facing underrepresentation, bias, limited networks, and isolation. Features: anonymous Forums, Nooks (temporary ephemeral discussions), Mentorship, Referrals, and encrypted Messaging. All interactions start anonymous—users control identity reveal.

## DATA

- **Forums**: Topics with title, content, author, reactions (seen/validated/inspired/heard), tags. Comments with helpful/supportive reactions. Scope: local (company) or global.
- **Nooks**: Temporary spaces with urgency (high/medium/low), temperature (hot/warm/cool), messages, expiration dates. Scope: global or company.
- **User context**: userType = "primary" (topic author) or "secondary" (engager via comments/reactions).

## TASK

Analyze the thread and generate: (1) concise summary, (2) key themes from discussion content, (3) consensus and disagreements, (4) unresolved open questions, (5) actionable suggestions tailored to userType.

## KEY THEMES

Extract from DISCUSSION CONTENT, not suggested actions. Themes = what people are talking about.
- 1 word preferred, 2 words max (e.g., "Isolation", "Recognition", "Career Growth")
- Must reflect discussion topics (e.g., "Bias", "Burnout"), NOT actions (e.g., "Documentation", "Escalation")
- Identify 3-5 themes with sentiment and supporting comment IDs

## SENTIMENT

Use ONLY: "Positive", "Neutral", "Negative"

- **Positive**: Supportive, encouraging, constructive problem-solving, solidarity—even when discussing challenges
- **Neutral**: Informational, balanced, exploratory, mixed emotions
- **Negative**: Frustration, discouragement, venting without constructive element, hopelessness

Key: Topic negativity ≠ sentiment negativity. A thread about bias can have Positive sentiment if responses are supportive. Advice-giving is Positive/Neutral even if the situation is bad.

- **overallSentiment**: Dominant tone of the entire thread
- **themes[].sentiment**: Tone for that specific topic (can differ from overall)

## ACTION ITEMS

Write as direct second-person imperatives. Rationales must be direct AI insights—NEVER reference commenters, posters, participants, the discussion, or comment IDs (c_001 etc.).

**Format:**
- "action": Short imperative title (3-6 words)
- "rationale": 2-3 sentences explaining WHY this helps. Direct insight only. No "commenters suggested...", "the thread shows...", "based on the discussion...".
- "nextSteps": 3-5 concrete steps with specifics (scripts, timelines, deliverables where helpful)

Good: "Keeping a detailed record of incidents—including dates, times, and witnesses—helps establish patterns and provides concrete evidence if escalation becomes necessary."

**For PRIMARY users (topic authors):**
- Synthesize into clear actions with concrete next steps and timelines ("before your next 1:1", "within 48 hours")
- Acknowledge power dynamics, risks of escalation, and protective measures
- Include both majority and minority viewpoints

**For SECONDARY users (engagers):**
- Identify what specific perspective, experience, or question they can contribute
- Name exactly what to share or ask—never meta-advice like "consider contributing"

**Confidence**: High = broadly supported, low risk. Med = has tradeoffs or context-dependent. Low = speculative or high-risk.

## CONSENSUS & DISAGREEMENTS

- Consensus: Repeated advice patterns, aligned high-engagement perspectives
- Disagreements: Contradicting viewpoints, risk/reward tradeoffs, minority challenges to majority

## OPEN QUESTIONS

Unresolved: missing info from poster, unsettled debates, unanswered follow-ups, implicit questions not yet raised.

## SAFETY

Flag if detected: PII, SELF_HARM, HARASSMENT, THREAT, CRISIS

## PRIVACY

- Never quote >12 verbatim words from any comment
- Never suggest identity reveal unless in trusted connections context
- Paraphrase and synthesize; protect anonymity

## DOMAIN GUIDANCE

- **Promotion**: "Vague feedback" often signals bias; suggest documentation, sponsorship (not just mentorship), skip-levels
- **Bias/Microaggressions**: Validate patterns; include protective strategies alongside confrontation; acknowledge risks of speaking up; build alliances before escalating
- **Job Search/Referrals**: Leverage platform referral marketplace; emphasize credibility-building
- **Mentorship**: Distinguish mentorship (advice) from sponsorship (advocacy); suggest specific asks
- **Workplace Culture**: "Culture fit" may mask bias; exit planning is valid; document for legal purposes

## OUTPUT SCHEMA

Return ONLY valid JSON. No markdown, no commentary.

{
  "tldr": "1-2 sentence summary",
  "overallSentiment": "Positive | Neutral | Negative",
  "keyThemes": ["TopicWord", "DiscussionTopic"],
  "openQuestions": ["Question 1", "Question 2"],
  "consensus": ["Agreement 1", "Agreement 2"],
  "disagreements": ["Conflict 1", "Conflict 2"],
  "themes": [
    { "name": "TopicWord", "sentiment": "Positive | Neutral | Negative", "supportingCommentIds": ["c_001"] }
  ],
  "actionItems": [
    {
      "action": "3-6 word imperative",
      "rationale": "Direct AI insight, no references to commenters or comment IDs",
      "nextSteps": ["Step 1", "Step 2", "Step 3"],
      "confidence": "Low | Med | High",
      "category": "Category"
    }
  ],
  "safetyFlags": []
}

Return ONLY the JSON object.`;

@Injectable()
export class OkestraLlmService {
  private readonly logger = new Logger(OkestraLlmService.name);
  private admin: SupabaseClient;
  private supabaseUrl: string;
  private serviceRoleKey: string;

  constructor(private config: ConfigService) {
    this.supabaseUrl = this.config.get<string>('SUPABASE_URL')!;
    this.serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!;
    this.admin = createClient(this.supabaseUrl, this.serviceRoleKey);
  }

  async generateInsights(
    contentType: ContentType,
    contentId: string,
    userId?: string,
  ): Promise<OkestraInsightsResult> {
    const { topic, comments } = await this.fetchContentData(
      contentType,
      contentId,
    );

    const threadPayload = this.buildThreadPayload(
      topic,
      comments,
      userId || 'anonymous',
    );

    const edgeFunctionUrl = `${this.supabaseUrl}/functions/v1/okestra-llm`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({
        threadPayload,
        systemPrompt: OKESTRA_SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        `Edge Function error: ${errorData.error || response.status}`,
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `LLM Error: ${data.error.message || String(data.error)}`,
      );
    }

    if (!data.choices?.[0]?.message?.content) {
      return this.getFallbackResponse();
    }

    try {
      return this.parseJsonResponse(data.choices[0].message.content);
    } catch {
      this.logger.warn('Failed to parse LLM response, returning fallback');
      return this.getFallbackResponse();
    }
  }

  private async fetchContentData(
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType === 'topic') {
      return this.fetchTopicData(contentId);
    }
    return this.fetchNookData(contentId);
  }

  private async fetchTopicData(topicId: string) {
    const { data: topicData } = await this.admin
      .from('forum_topics')
      .select(
        'id, title, content, tags, user_id, is_anonymous, reaction_seen_count, reaction_validated_count, reaction_inspired_count, reaction_heard_count, comments_count, user_profiles(username)',
      )
      .eq('id', topicId)
      .single();

    const { data: commentsData } = await this.admin
      .from('forum_comments')
      .select(
        'id, content, user_id, reaction_helpful_count, reaction_supportive_count, user_profiles(username)',
      )
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .limit(100);

    const topic = {
      title: topicData?.title || '',
      content: topicData?.content || '',
      tags: topicData?.tags || [],
      authorId: topicData?.user_id,
      authorUsername: topicData?.is_anonymous
        ? 'Anonymous'
        : (topicData?.user_profiles as any)?.username || 'Anonymous',
    };

    const comments = (commentsData || []).map((c) => ({
      content: c.content,
      authorId: c.user_id,
      authorUsername:
        (c.user_profiles as any)?.username || 'Anonymous',
      reactions:
        (c.reaction_helpful_count || 0) +
        (c.reaction_supportive_count || 0),
    }));

    return { topic, comments };
  }

  private async fetchNookData(nookId: string) {
    const { data: nookData } = await this.admin
      .from('nooks')
      .select(
        'id, title, description, hashtags, creator_id, urgency, temperature',
      )
      .eq('id', nookId)
      .single();

    const { data: messagesData } = await this.admin
      .from('nook_messages')
      .select(
        'id, content, user_id, heard_count, validated_count, helpful_count, inspired_count',
      )
      .eq('nook_id', nookId)
      .eq('is_removed', false)
      .order('created_at', { ascending: true })
      .limit(100);

    const topic = {
      title: nookData?.title || '',
      content: nookData?.description || '',
      tags: nookData?.hashtags || [],
      authorId: nookData?.creator_id,
      authorUsername: 'Anonymous',
    };

    const comments = (messagesData || []).map((m) => ({
      content: m.content,
      authorId: m.user_id,
      authorUsername: 'Anonymous',
      reactions:
        (m.heard_count || 0) +
        (m.validated_count || 0) +
        (m.helpful_count || 0) +
        (m.inspired_count || 0),
    }));

    return { topic, comments };
  }

  private buildThreadPayload(
    topic: {
      title: string;
      content: string;
      tags: string[];
      authorId: string;
      authorUsername: string;
    },
    comments: {
      content: string;
      authorId: string;
      authorUsername: string;
      reactions: number;
    }[],
    currentUserId: string,
  ) {
    const commentsPayload = comments.map((comment, index) => ({
      id: `c_${String(index + 1).padStart(3, '0')}`,
      author: comment.authorUsername,
      content:
        comment.content.length > 500
          ? comment.content.substring(0, 500) + '...'
          : comment.content,
      reactions: comment.reactions,
    }));

    const isPrimaryUser = topic.authorId === currentUserId;

    const userContext: Record<string, any> = {
      userId: currentUserId,
      userType: isPrimaryUser ? 'primary' : 'secondary',
    };

    if (isPrimaryUser) {
      const topEngaged = [...comments]
        .sort((a, b) => b.reactions - a.reactions)
        .slice(0, 5);
      const topEngagedIds = topEngaged.map((c) => {
        const idx = comments.indexOf(c);
        return `c_${String(idx + 1).padStart(3, '0')}`;
      });

      userContext.topicAuthorContext = {
        totalResponsesReceived: comments.length,
        topEngagedCommentIds: topEngagedIds,
        hasOpenQuestions: comments.some((c) => c.content.includes('?')),
      };
    } else {
      userContext.engagerContext = {
        hasCommented: false,
        hasReacted: false,
      };
    }

    return {
      userContext,
      topic: {
        title: topic.title,
        content:
          topic.content.length > 1000
            ? topic.content.substring(0, 1000) + '...'
            : topic.content,
        author: topic.authorUsername,
        tags: topic.tags,
        commentCount: comments.length,
      },
      thread: {
        comments: commentsPayload,
      },
    };
  }

  private parseJsonResponse(content: string): OkestraInsightsResult {
    let cleanContent = content.trim();

    if (cleanContent.startsWith('```json'))
      cleanContent = cleanContent.slice(7);
    else if (cleanContent.startsWith('```'))
      cleanContent = cleanContent.slice(3);
    if (cleanContent.endsWith('```'))
      cleanContent = cleanContent.slice(0, -3);
    cleanContent = cleanContent.trim();

    const jsonStart = cleanContent.indexOf('{');
    const jsonEnd = cleanContent.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      this.logger.error('No valid JSON object found in LLM response');
      return this.getFallbackResponse();
    }

    const parsed = JSON.parse(
      cleanContent.substring(jsonStart, jsonEnd + 1),
    );

    return {
      tldr: parsed.tldr || 'Thread analysis completed.',
      overallSentiment: parsed.overallSentiment || 'Neutral',
      keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : [],
      openQuestions: Array.isArray(parsed.openQuestions)
        ? parsed.openQuestions
        : [],
      consensus: Array.isArray(parsed.consensus) ? parsed.consensus : [],
      disagreements: Array.isArray(parsed.disagreements)
        ? parsed.disagreements
        : [],
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems
        : [],
      safetyFlags: Array.isArray(parsed.safetyFlags)
        ? parsed.safetyFlags
        : [],
    };
  }

  private getFallbackResponse(): OkestraInsightsResult {
    return {
      tldr: 'Analysis unavailable - the AI response could not be processed. Please try again.',
      overallSentiment: 'Neutral',
      keyThemes: [],
      openQuestions: [],
      consensus: [],
      disagreements: [],
      themes: [],
      actionItems: [],
      safetyFlags: [],
    };
  }
}
