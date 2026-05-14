import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import logger from '../../../common/utils/logger.util';
import { EditorialPayload } from './dto/editorial-payload.dto';
import { EditorialVerdict } from './dto/editorial-verdict.dto';
import { EDITORIAL_SYSTEM_PROMPT } from './editorial-prompts';

export class TogetherApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`Together.ai API error ${statusCode}`);
    this.name = 'TogetherApiError';
  }
}

@Injectable()
export class EditorialService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly isConfigured: boolean;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('TOGETHER_API_KEY') || '';
    this.baseUrl =
      this.config.get<string>('TOGETHER_BASE_URL') ||
      'https://api.together.xyz/v1';
    this.model =
      this.config.get<string>('TOGETHER_MODEL') ||
      'meta-llama/Llama-3.1-8B-Instruct-Turbo';
    this.timeoutMs = parseInt(
      this.config.get<string>('TOGETHER_TIMEOUT_MS') || '15000',
      10,
    );
    this.isConfigured = !!this.apiKey;

    if (!this.isConfigured) {
      logger.warn(
        'EditorialService: TOGETHER_API_KEY not configured. AI moderation will be unavailable.',
      );
    }
  }

  /**
   * Call the Together.ai LLM to judge a content item.
   * Returns null if the service is not configured (missing API key).
   */
  async judge(
    payload: EditorialPayload,
  ): Promise<EditorialVerdict | null> {
    if (!this.isConfigured) {
      return null;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: EDITORIAL_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      // Never include the API key in error logs
      logger.error('Together.ai API call failed', {
        status: res.status,
        model: this.model,
        responseBody: body.substring(0, 500),
      });
      throw new TogetherApiError(res.status, body);
    }

    const json = await res.json();
    return this.parseVerdict(json);
  }

  private parseVerdict(apiResponse: any): EditorialVerdict {
    const content = apiResponse?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in Together.ai response');
    }

    const parsed = JSON.parse(content);

    // Validate required fields with safe defaults
    const verdict = ['allow', 'hide', 'remove', 'escalate'].includes(
      parsed.verdict,
    )
      ? parsed.verdict
      : 'escalate';

    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;

    const severity = [
      'none',
      'low',
      'medium',
      'high',
      'critical',
    ].includes(parsed.severity)
      ? parsed.severity
      : 'medium';

    return {
      verdict,
      confidence,
      severity,
      categories: Array.isArray(parsed.categories)
        ? parsed.categories
        : [],
      rationale:
        typeof parsed.rationale === 'string'
          ? parsed.rationale.substring(0, 300)
          : '',
      userFacingReason: parsed.userFacingReason || null,
    };
  }
}
