/**
 * CoachSessionService — the coaching turn engine.
 *
 * This is the modality-agnostic core: it deals only in text turns. Web and
 * mobile clients call the same methods through the controller and render the
 * returned state, so every client gets the identical experience. The voice
 * layer (Azure STT/TTS) wraps this without changing it.
 *
 * Per client turn the engine: classifies safety (route, don't treat) →
 * reads memory → builds the stage prompt → runs the live turn on Together →
 * parses control tokens → advances the GROW machine → persists → returns state.
 */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { CoachRepositoryService } from './coach-repository.service';
import { CoachLlmRouterService, ChatMessage } from './coach-llm-router.service';
import { CoachSafetyService } from './coach-safety.service';
import { CoachProfileService } from './coach-profile.service';
import {
  CoachResourceService,
  formatResources,
} from './coach-resource.service';
import { Engagement } from '../interfaces/coaching.types';
import { buildStagePrompt } from '../state-machine/stage-prompts';
import { parseControlTokens } from '../state-machine/control-tokens';
import { resolveStage } from '../state-machine/grow.machine';
import { CoachLearningService } from './coach-learning.service';
import {
  CoachModality,
  CoachResourceLinks,
  CoachSession,
  CoachStage,
  TurnResult,
} from '../interfaces/coaching.types';

@Injectable()
export class CoachSessionService {
  private readonly logger = new Logger(CoachSessionService.name);

  constructor(
    private readonly repo: CoachRepositoryService,
    private readonly llm: CoachLlmRouterService,
    private readonly safety: CoachSafetyService,
    private readonly profile: CoachProfileService,
    private readonly learning: CoachLearningService,
    private readonly resources: CoachResourceService,
  ) {}

  private readonly PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Whether to retrieve + inject in-product resources this turn. Only in the
   * "doing" stages (where recommendations belong) or when the client explicitly
   * asks — so we don't pay for the search or the prompt block on every turn.
   */
  private wantsResources(stage: CoachStage, message: string): boolean {
    if (stage === 'OPTIONS' || stage === 'WILL') return true;
    // NB: prefix matches (no trailing \b) so plurals count — "mentors", "posts",
    // "resources", "guides" etc. An earlier \bword\b version missed all plurals.
    return /\b(resource|mentor|coach|forum|post|article|guide|discussion|thread|connect|recommend|refer|where can i|who (can|could)|anyone (who|that)|communit|group|support)/i.test(
      message,
    );
  }

  /**
   * Ensure we have a reasonably fresh coaching profile for the user, generating
   * it from their platform activity if missing/stale. Returns the profile text
   * (or whatever we have). Never throws.
   */
  private async ensureProfile(engagement: Engagement): Promise<string | null> {
    const fresh =
      engagement.profile &&
      engagement.profileRefreshedAt &&
      Date.now() - new Date(engagement.profileRefreshedAt).getTime() <
        this.PROFILE_TTL_MS;
    if (fresh) return engagement.profile;

    const generated = await this.profile.generateProfile(engagement.userId);
    if (generated) {
      await this.repo.saveProfile(engagement.id, generated);
      return generated;
    }
    return engagement.profile;
  }

  /**
   * Start (or resume into) a coaching session and produce the opening message.
   * The AI disclosure is injected at session start (compliance: persistent
   * disclosure of AI interaction).
   */
  async startSession(
    userId: string,
    modality: CoachModality = 'text',
  ): Promise<TurnResult> {
    const engagement = await this.repo.getOrCreateEngagement(userId);
    const startStage: CoachStage = 'OPENING';
    const session = await this.repo.createSession(
      engagement.id,
      userId,
      startStage,
      modality,
    );

    const clientName = await this.repo.getClientName(userId);
    const lastRecap = await this.repo.getLastSessionRecap(
      engagement.id,
      session.id,
    );
    const isFirstSession = !(await this.repo.hasPriorSessions(
      engagement.id,
      session.id,
    ));
    const profile = await this.ensureProfile(engagement);
    const learnings = await this.learning.getRules(8);

    const systemPrompt = buildStagePrompt(startStage, {
      clientName,
      focus: engagement.focus,
      semanticSummary: engagement.semanticSummary,
      lastSessionRecap: lastRecap,
      profile,
      isFirstSession,
      learnings,
    });

    // Kick off the opening turn. "__START__" is the conventional trigger; the
    // model greets and surfaces today's focus.
    let openingRaw: string;
    try {
      openingRaw = await this.llm.coachTurn(systemPrompt, [
        { role: 'user', content: '__START__' },
      ]);
    } catch (err) {
      this.logger.error(`Opening turn failed: ${String(err)}`);
      throw err;
    }

    const parsed = parseControlTokens(openingRaw);
    const resolvedStage = resolveStage(startStage, parsed.nextStage);
    // Never persist/return an empty message (can happen if the model emits only
    // control tokens) — the content column is NOT NULL.
    const coachMessage =
      parsed.cleanText.trim() ||
      'Hello — what would you like to focus on today?';

    await this.repo.addMessage(
      session.id,
      engagement.id,
      'coach',
      coachMessage,
      resolvedStage,
      modality,
    );
    if (resolvedStage !== startStage) {
      await this.repo.updateSessionStage(session.id, resolvedStage);
      await this.repo.updateEngagementStage(engagement.id, resolvedStage);
    }

    return {
      sessionId: session.id,
      coachMessage,
      stage: resolvedStage,
      phase: 'coach_speaking',
      isComplete: false,
      advicePending: parsed.adviceRequest,
      safety: { status: 'ok', category: 'NONE', severity: 'none' },
    };
  }

  /**
   * Process one client message and produce the coach's response + new state.
   */
  async processTurn(
    userId: string,
    sessionId: string,
    clientMessage: string,
    modality: CoachModality = 'text',
  ): Promise<TurnResult> {
    const session = await this.repo.getSession(sessionId);
    if (!session) {
      throw new ForbiddenException('Session not found');
    }
    if (session.userId !== userId) {
      // Hard ownership check — coaching content is strictly per-user.
      throw new ForbiddenException('Not your session');
    }

    // Resume: if the session had been ended (inactivity/close), re-open it so the
    // user continues from where they left off rather than starting over.
    if (session.status !== 'active') {
      await this.repo.reactivateSession(session.id);
    }

    // 1) Safety first — route, never treat.
    const safety = await this.safety.classify(clientMessage, session.id);
    if (safety.status === 'crisis') {
      await this.repo.addMessage(
        session.id,
        session.engagementId,
        'client',
        clientMessage,
        session.stage,
        modality,
      );
      await this.repo.logSafetyEvent(userId, session.id, safety, 'redirect');
      const redirect = safety.redirectMessage ?? '';
      await this.repo.addMessage(
        session.id,
        session.engagementId,
        'coach',
        redirect,
        session.stage,
        modality,
      );
      await this.repo.completeSession(
        session.id,
        'Session ended early and routed to crisis support.',
        null,
      );
      // Log an admin-only safety support ticket with the transcript + handle so
      // the team can follow up. Never let a ticket failure block the redirect.
      try {
        const handle = await this.repo.getClientHandle(userId);
        const turns = await this.repo.getTurns(session.id, 200);
        const transcript = turns
          .map((t) => `${t.role === 'coach' ? 'Coach' : 'Client'}: ${t.content}`)
          .join('\n');
        const ref = await this.repo.createSupportTicket({
          userId,
          handle,
          category: safety.category,
          severity: safety.severity,
          sessionId: session.id,
          transcript,
        });
        this.logger.warn(
          `Coaching safety ticket ${ref} created (${safety.category}/${safety.severity}) for handle @${handle ?? 'unknown'}`,
        );
      } catch (err) {
        this.logger.error(`Failed to create safety ticket: ${String(err)}`);
      }
      return {
        sessionId: session.id,
        coachMessage: redirect,
        stage: session.stage,
        phase: 'completed',
        isComplete: true,
        advicePending: false,
        safety,
      };
    }
    if (safety.status === 'flagged') {
      await this.repo.logSafetyEvent(userId, session.id, safety, 'none');
    }

    // 2) Persist the client turn (noting whether it's their first — the provisional goal).
    const priorClientTurns = await this.repo.countClientTurns(session.id);
    await this.repo.addMessage(
      session.id,
      session.engagementId,
      'client',
      clientMessage,
      session.stage,
      modality,
    );

    // 3) Read memory + build the stage prompt.
    const engagement = await this.repo.getOrCreateEngagement(userId);
    const clientName = await this.repo.getClientName(userId);
    const lastRecap = await this.repo.getLastSessionRecap(
      session.engagementId,
      session.id,
    );
    const stageTurnCount = await this.repo.countClientTurnsInStage(
      session.id,
      session.stage,
    );
    const isFirstSession = !(await this.repo.hasPriorSessions(
      session.engagementId,
      session.id,
    ));
    const learnings = await this.learning.getRules(6);
    // Ground the coach in REAL, accessible resources — but only when they're
    // actually useful (the doing stages, or when the client asks). Skipping this
    // on early/irrelevant turns saves both the DB search and the prompt tokens.
    const doResources = this.wantsResources(session.stage, clientMessage);
    const foundResources = doResources
      ? await this.resources.find(
          userId,
          [session.goal, clientMessage].filter(Boolean).join(' '),
        )
      : { mentors: [], topics: [], posts: [] };
    const resources = doResources ? formatResources(foundResources) : '';
    const systemPrompt = buildStagePrompt(session.stage, {
      clientName,
      focus: engagement.focus,
      semanticSummary: engagement.semanticSummary,
      lastSessionRecap: lastRecap,
      profile: engagement.profile,
      isFirstSession,
      learnings,
      sessionGoal: session.goal,
      referral: safety.referral,
      resources,
      stageTurnCount,
    });

    // 4) Build conversation history (coach→assistant, client→user). Capped at the
    //    recent window; the goal anchor + session memory carry older context, so
    //    we don't pay to resend the whole transcript every turn.
    const turns = await this.repo.getTurns(session.id, 12);
    const history: ChatMessage[] = turns.map((t) => ({
      role: t.role === 'coach' ? ('assistant' as const) : ('user' as const),
      content: t.content,
    }));

    // 5) Run the live coaching turn.
    const raw = await this.llm.coachTurn(systemPrompt, history);
    const parsed = parseControlTokens(raw);

    // 6) Advance the GROW machine (one legal step at a time).
    const resolvedStage = resolveStage(session.stage, parsed.nextStage);

    // 7) Capture the engagement focus the first time we leave OPENING, and pin
    //    the agreed session goal once the GOAL stage produces one.
    if (session.stage === 'OPENING' && resolvedStage === 'GOAL') {
      await this.repo.setEngagementFocus(session.engagementId, clientMessage);
    }
    // Capture the session goal: the model's explicit [GOAL:] is authoritative;
    // otherwise the client's very first message is the provisional goal, so an
    // anchor always exists even when the model forgets to emit the token.
    if (parsed.goal) {
      await this.repo.setSessionGoal(session.id, parsed.goal);
    } else if (!session.goal && priorClientTurns === 0) {
      await this.repo.setSessionGoal(session.id, clientMessage.slice(0, 300));
    }

    // 8) Capture a client-owned commitment if the coach locked one in.
    if (parsed.commitment) {
      await this.repo.addCommitment(
        session.engagementId,
        session.id,
        userId,
        parsed.commitment,
      );
    }

    // Never persist/return an empty message (can happen when the model emits
    // only control tokens) — the content column is NOT NULL.
    const coachMessage =
      parsed.cleanText.trim() || 'Go on — tell me a little more about that.';

    // The coach never ends on its OWN initiative, but it DOES end when the user
    // signals they're leaving. Coach understands that semantically and emits
    // [DONE] — we honour that (the prompt forbids ending for any other reason).
    const isComplete = parsed.done;

    // Attach the REAL retrieved resources as clickable cards — robustly, so the
    // coach never promises "cards below" that don't appear. A kind is surfaced if
    // the model emitted [SHOW: kind], OR named a specific item, OR simply gestured
    // at that kind in the reply ("a couple of mentors", "some discussions"), as
    // long as retrieval actually returned items of that kind.
    const msgLower = coachMessage.toLowerCase();
    const nameMatch = (s: string) => {
      const t = s.toLowerCase();
      return msgLower.includes(t) || msgLower.includes(t.slice(0, 24));
    };
    const gesturesMentors = /\bmentor/.test(msgLower);
    const gesturesTopics = /\b(topic|discussion|forum|thread|conversation)/.test(
      msgLower,
    );
    const gesturesPosts = /\bpost/.test(msgLower);
    const attachedResources: CoachResourceLinks = {
      mentors:
        parsed.show.mentors ||
        gesturesMentors ||
        foundResources.mentors.some((m) =>
          msgLower.includes(m.handle.toLowerCase()),
        )
          ? foundResources.mentors.slice(0, 3).map((m) => ({
              handle: m.handle,
              expertise: m.expertise,
              userId: m.userId,
            }))
          : [],
      topics:
        parsed.show.topics ||
        gesturesTopics ||
        foundResources.topics.some((t) => nameMatch(t.title))
          ? foundResources.topics.slice(0, 4).map((t) => ({
              title: t.title,
              forum: t.forum,
              topicId: t.topicId,
            }))
          : [],
      posts:
        parsed.show.posts ||
        gesturesPosts ||
        foundResources.posts.some((p) => nameMatch(p.snippet))
          ? foundResources.posts
              .slice(0, 2)
              .map((p) => ({ snippet: p.snippet, postId: p.postId }))
          : [],
    };

    // 9) Persist the coach turn + new stage (with its resource cards, so they
    //    survive session resume/reload).
    await this.repo.addMessage(
      session.id,
      session.engagementId,
      'coach',
      coachMessage,
      resolvedStage,
      modality,
      attachedResources,
    );
    if (resolvedStage !== session.stage) {
      await this.repo.updateSessionStage(session.id, resolvedStage);
      await this.repo.updateEngagementStage(session.engagementId, resolvedStage);
    }

    let askFeedback = false;
    if (isComplete) {
      askFeedback = await this.decideAskFeedback(session);
      await this.repo.completeSession(session.id, null, parsed.commitment);
      void this.consolidateInBackground(session.id);
    }

    return {
      sessionId: session.id,
      coachMessage,
      stage: resolvedStage,
      phase: isComplete ? 'completed' : 'coach_speaking',
      isComplete,
      advicePending: parsed.adviceRequest,
      askFeedback,
      resources: attachedResources,
      safety,
    };
  }


  /**
   * Return the user's most recent session with its transcript so the client can
   * offer "continue where you left off". Crisis-ended sessions are not resumable.
   */
  async getLatestSession(userId: string): Promise<{
    sessionId: string;
    stage: string;
    status: string;
    resumable: boolean;
    messages: {
      role: string;
      content: string;
      resources?: CoachResourceLinks;
    }[];
  } | null> {
    const session = await this.repo.getLatestSession(userId);
    if (!session) return null;
    const turns = await this.repo.getTurns(session.id, 100);
    if (turns.length === 0) return null;
    const hadCrisis = await this.repo.sessionHadCrisis(session.id);
    return {
      sessionId: session.id,
      stage: session.stage,
      status: session.status,
      resumable: !hadCrisis,
      messages: turns.map((t) => ({
        role: t.role,
        content: t.content,
        resources: t.resources,
      })),
    };
  }

  /**
   * Explicitly end a session — called when the user closes the panel or after
   * the client-side inactivity flow gets no response. The agent itself never
   * calls this; ending is always the user's choice (or their absence).
   */
  async endSession(
    userId: string,
    sessionId: string,
  ): Promise<{ ok: true; askFeedback: boolean }> {
    const session = await this.repo.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }
    let askFeedback = false;
    if (session.status === 'active') {
      askFeedback = await this.decideAskFeedback(session);
      await this.repo.completeSession(session.id, null, null);
      void this.consolidateInBackground(session.id);
    }
    return { ok: true, askFeedback };
  }

  /** Randomly sample which ended sessions to ask for feedback (~1 in 3). */
  private async decideAskFeedback(session: CoachSession): Promise<boolean> {
    if (await this.repo.hasFeedback(session.id)) return false;
    if (await this.repo.sessionHadCrisis(session.id)) return false;
    const turns = await this.repo.countClientTurns(session.id);
    if (turns < 2) return false;
    return Math.random() < 0.34;
  }

  /**
   * Record a user's star rating (+ optional comment) for a session, and feed it
   * into Coach's self-learning loop.
   */
  async submitFeedback(
    userId: string,
    sessionId: string,
    rating: number,
    comment?: string,
  ): Promise<{ ok: true }> {
    const session = await this.repo.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }
    const clean = (comment || '').trim().slice(0, 2000) || null;
    await this.repo.addFeedback(session.id, userId, rating, clean);
    // Self-learning: distill a generalisable lesson from low ratings or any
    // written feedback (fire-and-forget; the nightly cron curates them).
    if (rating <= 3 || clean) void this.learning.distill(rating, clean);
    return { ok: true };
  }

  /**
   * After a session ends, summarise it on the free/private vLLM endpoint and
   * store the recap so the next session can open by following up. Fire-and-
   * forget: never block or fail the user's turn on this.
   */
  private async consolidateInBackground(sessionId: string): Promise<void> {
    try {
      const turns = await this.repo.getTurns(sessionId, 100);
      if (turns.length === 0) return;
      const transcript = turns
        .map((t) => `${t.role === 'coach' ? 'Coach' : 'Client'}: ${t.content}`)
        .join('\n');
      const summary = await this.llm.vllmComplete(
        'You summarise a coaching session in 2-3 plain sentences for the coach to recall next time. Capture the focus, the key realisation, and the commitment the client made. No markdown.',
        transcript.slice(0, 6000),
        { maxTokens: 200 },
      );
      await this.repo.completeSession(sessionId, summary, null);
    } catch (err) {
      this.logger.warn(`Session consolidation failed: ${String(err)}`);
    }
  }
}
