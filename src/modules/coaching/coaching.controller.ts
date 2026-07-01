/**
 * Coaching agent — REST API.
 *
 * Contract-first and transport-agnostic: the full coaching loop works over
 * plain HTTP so web AND mobile clients get the identical experience. (A
 * WebSocket gateway can be layered on later as an enhancement, with a REST
 * equivalent for every event.) Same JWT bearer auth as the rest of the API.
 *
 * Routes are served under the global prefix → /api/v1/coaching/*
 */
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoachSessionService } from './services/coach-session.service';
import { CoachRepositoryService } from './services/coach-repository.service';
import { CoachSpeechService } from './services/coach-speech.service';
import { CoachLearningService } from './services/coach-learning.service';
import {
  ConsentDto,
  FeedbackDto,
  StartSessionDto,
  SttDto,
  TtsDto,
  TurnDto,
} from './dto/coaching.dto';

@ApiTags('Coaching')
@Controller('coaching')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CoachingController {
  constructor(
    private readonly sessions: CoachSessionService,
    private readonly repo: CoachRepositoryService,
    private readonly speech: CoachSpeechService,
    private readonly learning: CoachLearningService,
  ) {}

  @Get('support-tickets')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'List coaching safety support tickets (harm to self/others) — admin only',
  })
  async supportTickets() {
    return this.repo.listSupportTickets(100);
  }

  @Get('safety-evals')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Safety classifier vs regex-floor disagreements + counts (recall eval) — admin only',
  })
  async safetyEvals() {
    return this.repo.listSafetyEvals(100);
  }

  @Post('learnings/consolidate')
  @ApiOperation({
    summary:
      'Rebuild the self-learning rulebook now (dedup + weight). Normally runs nightly.',
  })
  async consolidate() {
    const count = await this.learning.consolidate();
    return { ok: true, rules: count };
  }

  @Post('consent')
  @ApiOperation({
    summary: 'Record granular, unbundled coaching data consent (collect/share)',
  })
  async setConsent(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConsentDto,
  ) {
    const engagement = await this.repo.getOrCreateEngagement(userId);
    await this.repo.setConsent(engagement.id, dto.collect, dto.share);
    return { ok: true };
  }

  @Get('sessions/latest')
  @ApiOperation({
    summary:
      "Get the user's most recent session + transcript so the client can resume it",
  })
  async latest(@CurrentUser('sub') userId: string) {
    return this.sessions.getLatestSession(userId);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Start a coaching session and get the opening turn' })
  async start(
    @CurrentUser('sub') userId: string,
    @Body() dto: StartSessionDto,
  ) {
    return this.sessions.startSession(userId, dto.modality ?? 'text');
  }

  @Post('sessions/:sessionId/turn')
  @ApiOperation({ summary: 'Send a client turn and get the coach response' })
  @ApiParam({ name: 'sessionId', description: 'Coaching session UUID' })
  async turn(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: TurnDto,
  ) {
    return this.sessions.processTurn(
      userId,
      sessionId,
      dto.message,
      dto.modality ?? 'text',
    );
  }

  @Post('sessions/:sessionId/end')
  @ApiOperation({
    summary:
      'End a session (user closed the panel or inactivity flow timed out). The agent never ends sessions itself.',
  })
  @ApiParam({ name: 'sessionId', description: 'Coaching session UUID' })
  async end(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessions.endSession(userId, sessionId);
  }

  @Post('sessions/:sessionId/feedback')
  @ApiOperation({
    summary: 'Submit a star rating (+ optional comment) for a session',
  })
  @ApiParam({ name: 'sessionId', description: 'Coaching session UUID' })
  async feedback(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.sessions.submitFeedback(
      userId,
      sessionId,
      dto.rating,
      dto.comment,
    );
  }

  @Post('tts')
  @ApiOperation({
    summary:
      'Synthesize coach speech (Azure). Returns {configured:false} if unset so clients fall back to a local voice.',
  })
  async tts(@Body() dto: TtsDto) {
    return this.speech.synthesize(dto.text, dto.voice);
  }

  @Post('stt')
  @ApiOperation({
    summary:
      'Transcribe client audio (Azure) for native clients. Web may use the browser Web Speech API instead.',
  })
  async stt(@Body() dto: SttDto) {
    const transcript = await this.speech.transcribe(
      dto.audioBase64,
      dto.contentType,
    );
    return { transcript };
  }
}
