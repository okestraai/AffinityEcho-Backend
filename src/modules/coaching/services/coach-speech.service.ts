/**
 * Server-side speech for the coaching agent — Azure Speech (STT + TTS).
 *
 * Why server-side: this is what makes web and mobile identical. Browser Web
 * Speech / speechSynthesis don't exist on native mobile, so the *authoritative*
 * voice capability lives behind the API. Web may still use the browser engines
 * as a fast/free fallback, but every client can get the same Azure voice and
 * transcription through these endpoints.
 *
 * Plain REST (no SDK) keeps the dependency surface unchanged. Audio crosses the
 * wire as base64 JSON so there are no binary-streaming or response-interceptor
 * edge cases and the contract is trivial for any client to consume.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SynthesisResult {
  configured: boolean;
  audioBase64?: string;
  contentType?: string;
}

@Injectable()
export class CoachSpeechService {
  private readonly logger = new Logger(CoachSpeechService.name);
  private readonly key: string;
  private readonly region: string;
  private readonly voice: string;

  constructor(private readonly config: ConfigService) {
    this.key = this.config.get<string>('AZURE_SPEECH_KEY') || '';
    this.region = this.config.get<string>('AZURE_SPEECH_REGION') || '';
    this.voice =
      this.config.get<string>('COACH_TTS_VOICE') ||
      'en-US-AvaMultilingualNeural';
  }

  get isConfigured(): boolean {
    return !!(this.key && this.region);
  }

  /**
   * Text → speech (mp3, base64). Returns { configured:false } when Azure Speech
   * isn't set up, so clients transparently fall back to a local engine.
   */
  async synthesize(text: string, voice?: string): Promise<SynthesisResult> {
    if (!this.isConfigured) return { configured: false };
    const safe = this.escapeSsml(text).slice(0, 4000);
    const ssml =
      `<speak version='1.0' xml:lang='en-US'>` +
      `<voice xml:lang='en-US' name='${voice || this.voice}'>${safe}</voice>` +
      `</speak>`;
    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'affinityecho-coach',
        },
        body: ssml,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        this.logger.warn(`Azure TTS failed ${res.status}`);
        return { configured: false };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        configured: true,
        audioBase64: buf.toString('base64'),
        contentType: 'audio/mpeg',
      };
    } catch (err) {
      this.logger.warn(`Azure TTS error: ${String(err)}`);
      return { configured: false };
    }
  }

  /**
   * Speech → text for native clients that record audio and POST it base64.
   * (Web can keep using the browser Web Speech API.) Returns null when not
   * configured or on failure.
   */
  async transcribe(
    audioBase64: string,
    contentType?: string,
  ): Promise<string | null> {
    if (!this.isConfigured) return null;
    const audio = Buffer.from(audioBase64, 'base64');
    const url =
      `https://${this.region}.stt.speech.microsoft.com` +
      `/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type':
            contentType || 'audio/wav; codecs=audio/pcm; samplerate=16000',
          Accept: 'application/json',
        },
        body: audio,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        this.logger.warn(`Azure STT failed ${res.status}`);
        return null;
      }
      const j: any = await res.json();
      return j?.DisplayText || j?.NBest?.[0]?.Display || null;
    } catch (err) {
      this.logger.warn(`Azure STT error: ${String(err)}`);
      return null;
    }
  }

  private escapeSsml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
