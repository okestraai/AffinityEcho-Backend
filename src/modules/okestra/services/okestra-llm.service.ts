import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ContentType,
  OkestraInsightsResult,
} from '../interfaces/insights.interface';

// Compact system prompt — optimized for speed with quantized 8B model
const OKESTRA_SYSTEM_PROMPT = `You are Okestra, an AI for Affinity Echo—an anonymous professional networking platform for underrepresented tech professionals. Analyze threads and return actionable JSON insights.

Users are anonymous by default. Forums have topics+comments; Nooks are temporary ephemeral discussions. userType "primary"=topic author, "secondary"=engager.

RULES:
- keyThemes: 1-2 word discussion topics (what people discuss, NOT actions). 3-5 themes.
- Sentiment: "Positive" (supportive/constructive even on hard topics), "Neutral" (balanced/mixed), "Negative" (frustration/hopelessness). Thread about bias with supportive replies = Positive.
- actionItems: Direct second-person imperatives. Rationales are YOUR insights—NEVER reference commenters, the discussion, or comment IDs. nextSteps: 2-3 concrete steps. Confidence: High=safe, Med=tradeoffs, Low=risky.
- For primary users: synthesize clear actions with timelines. For secondary: name specific contributions they can make.
- safetyFlags: only if PII, SELF_HARM, HARASSMENT, THREAT, or CRISIS detected.
- Never quote >12 verbatim words. Protect anonymity. Max 3 action items.

Return ONLY this JSON, nothing else:
{"tldr":"1-2 sentences","overallSentiment":"Positive|Neutral|Negative","keyThemes":["Theme"],"themes":[{"name":"Theme","sentiment":"Positive|Neutral|Negative","supportingCommentIds":["c_001"]}],"actionItems":[{"action":"3-6 words","rationale":"2 sentences, your insight only","nextSteps":["Step"],"confidence":"Low|Med|High","category":"category"}],"safetyFlags":[]}`;

@Injectable()
export class OkestraLlmService {
  private readonly logger = new Logger(OkestraLlmService.name);
  private admin: SupabaseClient;
  private vllmChatUrl: string;
  private cfClientId: string;
  private cfClientSecret: string;

  constructor(private config: ConfigService) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL')!;
    const serviceRoleKey = this.config.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    )!;
    this.admin = createClient(supabaseUrl, serviceRoleKey);

    // Direct vLLM connection (bypasses Supabase Edge Function)
    this.vllmChatUrl =
      this.config.get<string>('VLLM_CHAT_URL') ||
      'https://chat.affinityecho.com';
    this.cfClientId = this.config.get<string>('CF_ACCESS_CLIENT_ID') || '';
    this.cfClientSecret =
      this.config.get<string>('CF_ACCESS_CLIENT_SECRET') || '';
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

    // Call vLLM directly (OpenAI-compatible /v1/chat/completions)
    const response = await fetch(
      `${this.vllmChatUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Access-Client-Id': this.cfClientId,
          'CF-Access-Client-Secret': this.cfClientSecret,
        },
        body: JSON.stringify({
          model:
            'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
          messages: [
            { role: 'system', content: OKESTRA_SYSTEM_PROMPT },
            {
              role: 'user',
              content: JSON.stringify(threadPayload),
            },
          ],
          max_tokens: 1024,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(
        `vLLM error: ${errorData.error || response.status}`,
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
      themes: [],
      actionItems: [],
      safetyFlags: [],
    };
  }
}
