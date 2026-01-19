import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
  Put,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChatParticipantGuard } from '../guards/chat-participant.guard';
import { IdentityRevealService } from '../services/identity-reveal.service';
import {
  RequestIdentityRevealDto,
  RespondIdentityRevealDto,
  GetIdentityRevealsDto,
} from '../dto/identity-reveal.dto';

@ApiTags('Identity Reveal')
@Controller('identity-reveal')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class IdentityRevealController {
  constructor(private readonly identityRevealService: IdentityRevealService) {}

  @Post('request')
  @ApiOperation({
    summary: 'Request identity reveal',
    description: 'Request to reveal identity in a conversation',
  })
  @ApiBody({ type: RequestIdentityRevealDto })
  @ApiResponse({
    status: 201,
    description: 'Identity reveal request sent',
    schema: {
      example: {
        success: true,
        data: {
          reveal_id: 'uuid',
          conversation_id: 'uuid',
          status: 'pending',
          requested_at: '2024-01-01T12:00:00Z',
        },
        message: 'Identity reveal request sent',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async requestReveal(
    @CurrentUser() user: any,
    @Body() dto: RequestIdentityRevealDto,
  ) {
    return this.identityRevealService.requestReveal(user.userId, dto);
  }

  @Put('respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Respond to identity reveal',
    description: 'Accept or reject an identity reveal request',
  })
  @ApiBody({ type: RespondIdentityRevealDto })
  @ApiResponse({
    status: 200,
    description: 'Identity reveal request responded',
    schema: {
      example: {
        success: true,
        data: {
          reveal_id: 'uuid',
          status: 'accepted',
          responded_at: '2024-01-01T12:00:00Z',
        },
        message: 'Identity reveal request accepted',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Reveal request not found' })
  async respondToReveal(
    @CurrentUser() user: any,
    @Body() dto: RespondIdentityRevealDto,
  ) {
    return this.identityRevealService.respondToReveal(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get identity reveals',
    description: 'Get identity reveal requests and their status',
  })
  @ApiResponse({
    status: 200,
    description: 'Identity reveals retrieved',
    schema: {
      example: {
        success: true,
        data: {
          reveals: [
            {
              id: 'uuid',
              conversation_id: 'uuid',
              requester_id: 'uuid',
              responder_id: 'uuid',
              status: 'pending',
              requester_message: 'I would like to know who you are',
              created_at: '2024-01-01T12:00:00Z',
              updated_at: '2024-01-01T12:00:00Z',
              responded_at: null,
              requester: {
                id: 'uuid',
                username: 'Anonymous User',
                avatar: '👤',
              },
              responder: {
                id: 'uuid',
                username: 'Anonymous User',
                avatar: '👤',
              },
            },
          ],
          total: 5,
        },
      },
    },
  })
  async getReveals(
    @CurrentUser() user: any,
    @Query() dto: GetIdentityRevealsDto,
  ) {
    return this.identityRevealService.getReveals(user.userId, dto);
  }

  @Get('status/:conversationId')
  @ApiOperation({
    summary: 'Get identity reveal status',
    description: 'Get identity reveal status for a conversation',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID',
  })
  @UseGuards(ChatParticipantGuard)
  @ApiResponse({
    status: 200,
    description: 'Identity reveal status retrieved',
    schema: {
      example: {
        success: true,
        data: {
          identity_revealed: false,
          pending_request: {
            id: 'uuid',
            status: 'pending',
          },
          can_request: true,
        },
      },
    },
  })
  async getRevealStatus(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    return this.identityRevealService.getRevealStatus(
      user.userId,
      conversationId,
    );
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get identity reveal analytics',
    description: 'Get analytics about identity reveals',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics retrieved',
    schema: {
      example: {
        success: true,
        data: {
          total_requests: 45,
          accepted: 30,
          rejected: 10,
          pending: 5,
          acceptance_rate: 0.67,
          average_response_time_hours: 12,
          most_active_day: 'Monday',
          requests_by_chat_type: {
            regular: 25,
            mentorship: 20,
          },
          recent_activity: [
            {
              date: '2024-01-01',
              requests: 3,
              accepted: 2,
              rejected: 1,
            },
          ],
        },
      },
    },
  })
  async getAnalytics(@CurrentUser() user: any) {
    // This would typically aggregate data from the database
    return {
      success: true,
      data: {
        total_requests: 45,
        accepted: 30,
        rejected: 10,
        pending: 5,
        acceptance_rate: 0.67,
        average_response_time_hours: 12,
        most_active_day: 'Monday',
        requests_by_chat_type: {
          regular: 25,
          mentorship: 20,
        },
        recent_activity: [
          {
            date: '2024-01-01',
            requests: 3,
            accepted: 2,
            rejected: 1,
          },
          {
            date: '2023-12-31',
            requests: 2,
            accepted: 1,
            rejected: 1,
          },
        ],
        top_requesters: [
          { user_id: 'uuid', username: 'user1', requests: 5 },
          { user_id: 'uuid', username: 'user2', requests: 4 },
        ],
        top_responders: [
          { user_id: 'uuid', username: 'user3', responses: 8 },
          { user_id: 'uuid', username: 'user4', responses: 7 },
        ],
      },
    };
  }
}
