/**
 * Per-turn safety classifier for the coaching agent.
 *
 * Runs on EVERY client turn, BEFORE the coach reasons. Its only job is routing:
 * detect when a user crosses from "navigating a hard situation" into clinical
 * distress or acute risk, so the engine can gracefully redirect to crisis/EAP
 * resources. Detection is for routing, never for delivering treatment.
 *
 * Uses the small/fast Together model (the same one editorial moderation uses).
 * Fails OPEN to a conservative "ok" only when unconfigured — any positive
 * signal short-circuits coaching.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoachLlmRouterService } from './coach-llm-router.service';
import { CoachRepositoryService } from './coach-repository.service';
import {
  ReferralType,
  SafetyCategory,
  SafetyResult,
  SafetySeverity,
} from '../interfaces/coaching.types';

const SAFETY_SYSTEM_PROMPT = `You are a safety router for a non-clinical coaching chat. Classify ONLY the most recent user message for acute risk. You are not a coach and you do not reply to the user.

Return ONLY valid JSON: {"category":"NONE|SELF_HARM|CRISIS|HARASSMENT|THREAT","severity":"none|low|medium|high|critical","referral":"NONE|THERAPIST|PROFESSIONAL"}

Definitions:
- SELF_HARM: suicidal ideation, self-injury, intent or plan to harm oneself.
- CRISIS: acute mental-health emergency, being in immediate danger, abuse in progress.
- THREAT: intent to seriously harm another person.
- HARASSMENT: targeted abuse directed at the assistant or a third party.
- NONE: ordinary workplace/career/life difficulty, stress, frustration, sadness — these are NORMAL coaching topics, not risk.

Be precise: venting about a hard job, a bad manager, burnout, or feeling stuck is NONE. Reserve SELF_HARM/CRISIS for genuine risk to safety.

REFERRAL — independent of acute risk; flag when the person would be better served by a HUMAN professional than by a non-clinical AI coach:
- THERAPIST: clinical mental-health territory that is NOT an acute emergency — ongoing depression or anxiety, trauma or PTSD, grief, addiction, eating disorders, abuse history, or distress clearly beyond everyday stress.
- PROFESSIONAL: an issue that genuinely needs a qualified specialist outside coaching — medical, legal, or serious financial matters.
- NONE: an ordinary coaching topic the AI coach can hold.
A message can be NONE for risk but THERAPIST or PROFESSIONAL for referral (e.g. "I've been deeply depressed for months" → category NONE/low, referral THERAPIST).`;

@Injectable()
export class CoachSafetyService {
  private readonly logger = new Logger(CoachSafetyService.name);
  private readonly safetyModel: string;
  private readonly crisisMessage: string;
  private readonly threatMessage: string;

  constructor(
    private readonly config: ConfigService,
    private readonly llm: CoachLlmRouterService,
    private readonly repo: CoachRepositoryService,
  ) {
    this.safetyModel =
      this.config.get<string>('COACH_SAFETY_MODEL') ||
      'meta-llama/Llama-3.1-8B-Instruct-Turbo';
    this.crisisMessage =
      this.config.get<string>('COACH_CRISIS_MESSAGE') ||
      "I want to pause our coaching here because what you've shared sounds really serious, and you deserve support from someone trained for this. If you're in immediate danger, please contact your local emergency number now. In the US you can call or text 988 for the Suicide and Crisis Lifeline, any time. You can also reach your employer's confidential assistance program. I'm not able to help with this myself, but I care that you get the right support.";
    this.threatMessage =
      this.config.get<string>('COACH_THREAT_MESSAGE') ||
      "I'm going to stop here. I can't help with anything intended to harm another person. If someone is in danger, please contact your local emergency services right away. I've flagged this so our team can follow up, and I'd encourage you to speak with a professional who can help you work through what you're feeling safely.";
  }

  /**
   * Classify a client message. Never throws — on any error it returns a
   * conservative "ok" so a classifier outage cannot block the session, while a
   * genuine positive signal always routes away from coaching.
   */
  async classify(
    clientMessage: string,
    sessionId: string | null = null,
  ): Promise<SafetyResult> {
    // Layer 1: deterministic high-recall floor. If it fires we route to crisis
    // IMMEDIATELY (fast), and run the classifier in the BACKGROUND only to log
    // whether it agreed (a 'classifier_miss' is a recall failure to investigate).
    const hard = this.hardCheck(clientMessage);
    if (hard) {
      if (this.llm.isLiveConfigured) {
        void this.evalAgainstClassifier(clientMessage, sessionId, hard.category);
      }
      return hard;
    }

    if (!this.llm.isLiveConfigured) {
      return { status: 'ok', category: 'NONE', severity: 'none', referral: 'none' };
    }

    // Layer 2: the LLM classifier (with retry). It is the primary semantic
    // evaluator and catches what the regex cannot.
    const parsed = await this.runClassifier(clientMessage);
    if (!parsed) {
      // Classifier unavailable after retries. The regex floor already ran clean,
      // so we fail open here (a single outage shouldn't break every session) —
      // explicit risk is still covered by Layer 1.
      return { status: 'ok', category: 'NONE', severity: 'none', referral: 'none' };
    }

    const referral = parsed.referral;
    if (this.isClsCrisis(parsed)) {
      // The classifier caught something the regex floor did not — log the gap.
      void this.repo
        .logSafetyEval({
          sessionId,
          kind: 'regex_gap',
          regexCategory: null,
          classifierCategory: parsed.category,
          classifierSeverity: parsed.severity,
          message: clientMessage,
        })
        .catch(() => {});
      const harmToOthers = parsed.category === 'THREAT';
      return {
        status: 'crisis',
        category: parsed.category,
        severity: parsed.severity,
        redirectMessage: harmToOthers ? this.threatMessage : this.crisisMessage,
        referral,
      };
    }

    if (parsed.category !== 'NONE') {
      return {
        status: 'flagged',
        category: parsed.category,
        severity: parsed.severity,
        referral,
      };
    }
    return { status: 'ok', category: 'NONE', severity: 'none', referral };
  }

  private isClsCrisis(p: {
    category: SafetyCategory;
    severity: SafetySeverity;
  }): boolean {
    const severe = p.severity === 'high' || p.severity === 'critical';
    return (
      severe &&
      (p.category === 'SELF_HARM' ||
        p.category === 'CRISIS' ||
        p.category === 'THREAT')
    );
  }

  /** Run the classifier with bounded retries. Returns null only after failure. */
  private async runClassifier(message: string): Promise<{
    category: SafetyCategory;
    severity: SafetySeverity;
    referral: ReferralType;
  } | null> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await this.llm.togetherJson(
          this.safetyModel,
          SAFETY_SYSTEM_PROMPT,
          message.slice(0, 2000),
        );
        return this.parse(raw);
      } catch (err) {
        this.logger.warn(
          `safety classify attempt ${attempt}/3 failed: ${String(err)}`,
        );
        if (attempt < 3)
          await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    this.logger.error(
      'safety classifier failed after retries — relying on the regex floor only',
    );
    return null;
  }

  /** Background: when the regex floor fired, check if the classifier agreed. */
  private async evalAgainstClassifier(
    message: string,
    sessionId: string | null,
    regexCategory: SafetyCategory,
  ): Promise<void> {
    try {
      const parsed = await this.runClassifier(message);
      if (!parsed || !this.isClsCrisis(parsed)) {
        await this.repo.logSafetyEval({
          sessionId,
          kind: 'classifier_miss',
          regexCategory,
          classifierCategory: parsed?.category ?? null,
          classifierSeverity: parsed?.severity ?? null,
          message,
        });
      }
    } catch {
      /* eval logging is best-effort */
    }
  }

  /**
   * Deterministic detector for explicit harm-to-self / harm-to-others phrasing.
   * High recall by design; phrased to avoid common idioms ("this job is killing
   * me" does NOT match "kill myself"). Returns a crisis result or null.
   */
  private hardCheck(message: string): SafetyResult | null {
    const m = ' ' + message.toLowerCase().replace(/\s+/g, ' ') + ' ';

    const selfHarm =
      /\b(kill(ing)?\s+myself|killed\s+myself|end(ing)?\s+my\s+life|end\s+it\s+all|take\s+my\s+own\s+life|taking\s+my\s+(own\s+)?life|slit\s+my\s+wrists|want(ing)?\s+to\s+die|wanna\s+die|want\s+to\s+be\s+dead|better\s+off\s+dead|kill\s+myself|commit\s+suicide|suicid(e|al)|hurt(ing)?\s+myself|harm(ing)?\s+myself|cut(ting)?\s+myself|overdose|don'?t\s+want\s+to\s+(live|be\s+here|be\s+alive)|no\s+reason\s+to\s+(live|go\s+on)|end\s+my\s+own\s+life)\b/i.test(
        m,
      );
    if (selfHarm) {
      return {
        status: 'crisis',
        category: 'SELF_HARM',
        severity: 'critical',
        redirectMessage: this.crisisMessage,
      };
    }

    const threat =
      /\b(?:(?:going|gonna|want|wanna|plan(?:ning)?|about)\s+to\s+)?(?:kill|murder|shoot|stab|attack|hurt|harm|beat\s+up|strangle|choke|hit)\s+(?:(?:him|her|them|someone|somebody|everyone|everybody|people|y'?all|you\s+all)|my\s+(?:co-?worker|colleague|boss|manager|supervisor|wife|husband|spouse|partner|ex|girlfriend|boyfriend|neighbou?r|friend|roommate|landlord|teacher|family|brother|sister|mother|father|mom|dad|son|daughter|kid|child)|the\s+(?:whole\s+)?(?:office|team|class|building|company|school|store))\b/i.test(
        m,
      ) ||
      /\bshoot\s+up\b/i.test(m) ||
      /\bmake\s+(?:him|her|them)\s+pay\b/i.test(m);
    if (threat) {
      return {
        status: 'crisis',
        category: 'THREAT',
        severity: 'critical',
        redirectMessage: this.threatMessage,
      };
    }

    return null;
  }

  private parse(raw: string): {
    category: SafetyCategory;
    severity: SafetySeverity;
    referral: ReferralType;
  } {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) {
      return { category: 'NONE', severity: 'none', referral: 'none' };
    }
    const obj = JSON.parse(raw.slice(start, end + 1));
    const validCat: SafetyCategory[] = [
      'NONE',
      'SELF_HARM',
      'CRISIS',
      'HARASSMENT',
      'THREAT',
      'PII',
      'CLINICAL',
    ];
    const validSev: SafetySeverity[] = [
      'none',
      'low',
      'medium',
      'high',
      'critical',
    ];
    const category: SafetyCategory = validCat.includes(obj.category)
      ? obj.category
      : 'NONE';
    const severity: SafetySeverity = validSev.includes(obj.severity)
      ? obj.severity
      : 'none';
    const refRaw = String(obj.referral || 'NONE').toLowerCase();
    const referral: ReferralType =
      refRaw === 'therapist'
        ? 'therapist'
        : refRaw === 'professional'
          ? 'professional'
          : 'none';
    return { category, severity, referral };
  }
}
