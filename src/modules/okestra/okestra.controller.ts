import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OkestraService } from './services/okestra.service';
import { ContentType } from './interfaces/insights.interface';

@ApiTags('Okestra AI')
@Controller('okestra')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OkestraController {
  constructor(private readonly okestraService: OkestraService) {}

  @Get('insights/:contentType/:contentId')
  @ApiOperation({ summary: 'Get AI insights for a topic or nook' })
  @ApiParam({ name: 'contentType', enum: ['topic', 'nook'] })
  @ApiParam({ name: 'contentId', description: 'Topic or Nook UUID' })
  async getInsights(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.okestraService.getInsights(
      contentType,
      contentId,
      userId,
    );
  }

  @Post('insights/:contentType/:contentId/generate')
  @ApiOperation({ summary: 'Force synchronous AI insight generation' })
  @ApiParam({ name: 'contentType', enum: ['topic', 'nook'] })
  @ApiParam({ name: 'contentId', description: 'Topic or Nook UUID' })
  async generateSync(
    @Param('contentType') contentType: ContentType,
    @Param('contentId') contentId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const insights = await this.okestraService.generateSync(
      contentType,
      contentId,
      userId,
    );
    return { insights, status: 'fresh' };
  }
}
