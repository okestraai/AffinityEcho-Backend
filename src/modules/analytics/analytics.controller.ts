import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { CollectPayload } from './dto/collect.dto';

// PUBLIC ingest endpoint — no auth guard, so anonymous website visitors are
// captured too. If a valid Bearer token is present we attribute the session to
// that user (best-effort decode; failure = anonymous). CSRF middleware already
// skips no-cookie / Bearer requests, and axios auto-sends X-XSRF-TOKEN for web,
// so both cases pass. The write is fire-and-forget and can never 400 or block.
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly ingest: AnalyticsIngestService,
    private readonly jwt: JwtService,
  ) {}

  @Post('collect')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({
    summary: 'Ingest anonymous/authenticated visitor analytics events',
  })
  async collect(@Body() body: CollectPayload, @Req() req: any) {
    const userId = await this.tryUserId(req);
    // Fire-and-forget: the ingest service swallows all errors internally.
    void this.ingest.record(body || {}, req, userId);
    return { ok: true };
  }

  private async tryUserId(req: any): Promise<string | null> {
    try {
      const auth = req?.headers?.authorization;
      if (!auth || !auth.startsWith('Bearer ')) return null;
      const payload = await this.jwt.verifyAsync(auth.slice(7), {
        secret: process.env.JWT_SECRET,
      });
      return payload?.sub || null;
    } catch {
      return null; // invalid/expired token → treat as anonymous
    }
  }
}
