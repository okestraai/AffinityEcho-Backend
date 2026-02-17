import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { NookReactionsService } from '../services/nook-reactions.service';
import { ReactionDto } from '../dto/reaction.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NookActiveGuard } from '../guards/nook-active.guard';

@ApiTags('Nook Reactions')
@Controller()
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class NookReactionsController {
  constructor(private readonly reactionsService: NookReactionsService) {}

  // ── NOOK REACTIONS ──────────────────────────────────────────────────────

  @Post('nooks/:id/reactions')
  @UseGuards(NookActiveGuard)
  @ApiOperation({ summary: 'Add reaction to a nook' })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiBody({ type: ReactionDto })
  async reactToNook(
    @Param('id', ParseUUIDPipe) nookId: string,
    @Body() reactionDto: ReactionDto,
    @CurrentUser() user: any,
  ) {
    return this.reactionsService.reactToNook(nookId, user.userId, reactionDto);
  }

  @Delete('nooks/:id/reactions')
  @ApiOperation({ summary: 'Remove your reaction from a nook' })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiQuery({ name: 'reaction_type', required: true })
  async removeNookReaction(
    @Param('id', ParseUUIDPipe) nookId: string,
    @Query('reaction_type') reactionType: string,
    @CurrentUser() user: any,
  ) {
    return this.reactionsService.removeNookReaction(
      nookId,
      user.userId,
      reactionType,
    );
  }

  // ── MESSAGE REACTIONS (TOGGLE) ──────────────────────────────────────────

  @Post('nooks/messages/:id/reactions')
  @ApiOperation({
    summary: 'Toggle reaction on a message',
    description: 'Add if not present, remove if already exists',
  })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiBody({ type: ReactionDto })
  @ApiResponse({
    status: 200,
    description: 'Reaction toggled',
    type: Object,
  })
  async toggleMessageReaction(
    @Param('id', ParseUUIDPipe) messageId: string,
    @Body() reactionDto: ReactionDto,
    @CurrentUser() user: any,
  ) {
    return this.reactionsService.toggleMessageReaction(
      messageId,
      user.userId,
      reactionDto,
    );
  }
}
