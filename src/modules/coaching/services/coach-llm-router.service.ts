/**
 * Hybrid LLM router for the coaching agent.
 *
 *   Live coaching turn  → Together.ai  (Llama-3.3-70B-Instruct-Turbo by default)
 *   Background / batch   → self-hosted vLLM  (Llama-3.1-8B, free + fully private)
 *
 * This service re-implements thin clients for both providers so the coaching
 * module stays standalone — it does NOT import OkestraLlmService or
 * EditorialService. It mirrors their proven fetch/timeout/retry patterns.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class CoachLlmRouterService {
  private readonly logger = new Logger(CoachLlmRouterService.name);

  // Together.ai (live coaching turn)
  private readonly togetherApiKey: string;
  private readonly togetherBaseUrl: string;
  private readonly coachModel: string;
  private readonly togetherTimeoutMs: number;

  // self-hosted vLLM (background work)
  private readonly vllmChatUrl: string;
  private readonly cfClientId: string;
  private readonly cfClientSecret: string;
  private readonly vllmModel: string;
  private readonly vllmTimeoutMs = 30000;

  constructor(private readonly config: ConfigService) {
    this.togetherApiKey = this.config.get<string>('TOGETHER_API_KEY') || '';
    this.togetherBaseUrl =
      this.config.get<string>('TOGETHER_BASE_URL') ||
      'https://api.together.xyz/v1';
    this.coachModel =
      this.config.get<string>('TOGETHER_COACH_MODEL') ||
      'meta-llama/Llama-3.3-70B-Instruct-Turbo';
    this.togetherTimeoutMs = parseInt(
      this.config.get<string>('COACH_TURN_TIMEOUT_MS') || '20000',
      10,
    );

    this.vllmChatUrl =
      this.config.get<string>('VLLM_CHAT_URL') || 'https://chat.affinityecho.com';
    this.cfClientId = this.config.get<string>('CF_ACCESS_CLIENT_ID') || '';
    this.cfClientSecret =
      this.config.get<string>('CF_ACCESS_CLIENT_SECRET') || '';
    this.vllmModel =
      this.config.get<string>('VLLM_COACH_MODEL') ||
      'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4';

    if (!this.togetherApiKey) {
      this.logger.warn(
        'TOGETHER_API_KEY not set — live coaching turns will be unavailable.',
      );
    }
  }

  get isLiveConfigured(): boolean {
    return !!this.togetherApiKey;
  }

  /**
   * Run one live coaching turn on Together.ai. Short max_tokens keeps the coach
   * terse (one reflection + one question) and latency low for the voice path.
   */
  async coachTurn(
    systemPrompt: string,
    history: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];
    const payload = {
      model: this.coachModel,
      messages,
      max_tokens: options?.maxTokens ?? 512,
      temperature: options?.temperature ?? 0.6,
    };

    // Bounded retry so a single transient Together.ai blip (5xx / timeout)
    // doesn't surface to the user as a failed turn.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${this.togetherBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.togetherApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.togetherTimeoutMs),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Together.ai error ${res.status}: ${body.slice(0, 200)}`);
        }
        const json = await res.json();
        return (json?.choices?.[0]?.message?.content ?? '').trim();
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `coachTurn attempt ${attempt}/3 failed: ${String(err)}`,
        );
        if (attempt < 3) await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Together.ai coach turn failed');
  }

  /**
   * Ask Together.ai for a strict-JSON response (used by the safety classifier).
   * Returns the raw assistant string; caller parses.
   */
  async togetherJson(
    model: string,
    systemPrompt: string,
    userContent: string,
    timeoutMs = 8000,
  ): Promise<string> {
    const res = await fetch(`${this.togetherBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 200,
        temperature: 0.0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Together.ai classify error ${res.status}`);
    }
    const json = await res.json();
    return (json?.choices?.[0]?.message?.content ?? '').trim();
  }

  /**
   * Background generation on the self-hosted vLLM endpoint (free, private).
   * Used for session summaries and memory consolidation. Bounded timeout + a
   * single retry, mirroring OkestraLlmService.
   */
  async vllmComplete(
    systemPrompt: string,
    userContent: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    const payload = {
      model: this.vllmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: options?.maxTokens ?? 512,
      temperature: options?.temperature ?? 0.3,
    };

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.vllmTimeoutMs);
      try {
        const res = await fetch(`${this.vllmChatUrl}/v1/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'CF-Access-Client-Id': this.cfClientId,
            'CF-Access-Client-Secret': this.cfClientSecret,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`vLLM error ${res.status}`);
        const json = await res.json();
        return (json?.choices?.[0]?.message?.content ?? '').trim();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`vLLM attempt ${attempt}/2 failed: ${String(err)}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('vLLM request failed');
  }
}
