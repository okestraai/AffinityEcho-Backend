import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MentorshipChatGuard } from '../guards/mentorship-chat.guard';
import { ChatParticipantGuard } from '../guards/chat-participant.guard';
import { MentorshipChatService } from '../services/mentorship-chat.service';

@ApiTags('Mentorship Chat')
@Controller('mentorship-chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipChatController {
  constructor(private readonly mentorshipChatService: MentorshipChatService) {}

  @Get('profile/:userId')
  @ApiOperation({
    summary: 'Get mentorship profile',
    description: 'Get mentorship profile for a user (opens in modal)',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID to get profile for',
  })
  @ApiQuery({
    name: 'relationship_id',
    required: false,
    type: String,
    description: 'Relationship ID if applicable',
  })
  @ApiResponse({
    status: 200,
    description: 'Mentorship profile retrieved',
    schema: {
      example: {
        success: true,
        data: {
          profile: {
            id: 'uuid',
            username: 'TechLeader_Sarah',
            avatar: '👩🏾‍💼',
            mentor_bio: 'VP of Engineering with 15+ years experience...',
            mentor_expertise: ['Technical Leadership', 'Career Development'],
            mentor_industries: ['Technology', 'SaaS'],
            mentor_availability: '2 hours per week',
            mentor_response_time: '24 hours',
            mentor_style: 'Collaborative',
            mentor_languages: ['English', 'Spanish'],
            mentoring_as: 'mentor',
            years_experience: 15,
            skills: ['Leadership', 'System Design', 'Agile'],
            job_title: 'VP of Engineering',
            company: 'Microsoft',
            career_level: 'Executive',
            location: 'San Francisco',
            reputation_score: 95,
            mentorship_sessions_completed: 42,
            last_active: '2024-01-01T12:00:00Z',
          },
          relationship_info: {
            id: 'uuid',
            status: 'active',
            role: 'mentee',
            started_at: '2023-11-01T10:00:00Z',
            completed_sessions: 5,
            total_sessions: 12,
            next_session_at: '2024-01-15T14:00:00Z',
            meeting_frequency: 'bi-weekly',
            match_score: 92,
            mentor_rating: 5,
            mentee_rating: 4,
          },
          upcoming_sessions: [
            {
              id: 'uuid',
              scheduled_at: '2024-01-15T14:00:00Z',
              duration_minutes: 60,
              agenda: 'Career progression discussion',
              status: 'scheduled',
            },
          ],
          can_reveal_identity: true,
          is_online: true,
        },
      },
    },
  })
  async getMentorshipProfile(
    @CurrentUser() user: any,
    @Param('userId') targetUserId: string,
    @Query('relationship_id') relationshipId?: string,
  ) {
    return this.mentorshipChatService.getMentorshipProfile(
      user.userId,
      targetUserId,
      relationshipId,
    );
  }

  @Post('schedule-session')
  @ApiOperation({
    summary: 'Schedule mentorship session',
    description: 'Schedule a new mentorship session',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        duration: { type: 'number' },
        notes: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Session scheduled successfully',
    schema: {
      example: {
        success: true,
        data: {
          session_id: 'uuid',
          scheduled_at: '2024-01-15T14:00:00Z',
          duration_minutes: 60,
          status: 'scheduled',
        },
        message: 'Session scheduled successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  async scheduleSession(@CurrentUser() user: any, @Body() sessionData: any) {
    return this.mentorshipChatService.scheduleSession(
      user.userId,
      sessionData.relationship_id,
      sessionData,
    );
  }

  @Post('start-from-request/:requestId')
  @ApiOperation({
    summary: 'Start mentorship chat from direct request',
    description: 'Start a mentorship chat from an accepted direct request',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Direct mentorship request ID',
  })
  @ApiBody({
    schema: {
      example: {
        initial_message: 'Hi! Looking forward to our mentorship journey!',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Mentorship chat started',
    schema: {
      example: {
        success: true,
        data: {
          conversation_id: 'uuid',
          relationship_id: 'uuid',
          other_user: {
            id: 'uuid',
            role: 'mentor',
          },
          chat_type: 'mentorship',
        },
        message: 'Mentorship chat started successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async startFromRequest(
    @CurrentUser() user: any,
    @Param('requestId') requestId: string,
    @Body('initial_message') initialMessage?: string,
  ) {
    return this.mentorshipChatService.startMentorshipChat(
      user.userId,
      requestId,
      initialMessage,
    );
  }

  @Get('session-history/:relationshipId')
  @ApiOperation({
    summary: 'Get session history',
    description: 'Get past mentorship sessions for a relationship',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of sessions to fetch (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Session history retrieved',
    schema: {
      example: {
        success: true,
        data: {
          sessions: [
            {
              id: 'uuid',
              scheduled_at: '2023-12-01T14:00:00Z',
              duration_minutes: 60,
              status: 'completed',
              mentor_notes: 'Great progress on project',
              mentee_notes: 'Learned a lot about system design',
              mentor_rating: 5,
              mentee_rating: 4,
            },
          ],
          total: 8,
          average_session_duration: 55,
          completion_rate: 0.88,
          average_ratings: {
            mentor: 4.8,
            mentee: 4.5,
          },
        },
      },
    },
  })
  async getSessionHistory(
    @CurrentUser() user: any,
    @Param('relationshipId') relationshipId: string,
    @Query('limit') limit?: number,
  ) {
    // This would query mentorship_sessions table
    return {
      success: true,
      data: {
        sessions: [
          {
            id: 'uuid',
            scheduled_at: '2023-12-01T14:00:00Z',
            duration_minutes: 60,
            status: 'completed',
            mentor_notes: 'Great progress on project',
            mentee_notes: 'Learned a lot about system design',
            mentor_rating: 5,
            mentee_rating: 4,
          },
        ],
        total: 8,
        average_session_duration: 55,
        completion_rate: 0.88,
        average_ratings: {
          mentor: 4.8,
          mentee: 4.5,
        },
      },
    };
  }

  @Get('resources/:conversationId')
  @ApiOperation({
    summary: 'Get mentorship resources',
    description: 'Get shared resources in a mentorship conversation',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID',
  })
  @UseGuards(ChatParticipantGuard, MentorshipChatGuard)
  @ApiResponse({
    status: 200,
    description: 'Resources retrieved',
    schema: {
      example: {
        success: true,
        data: {
          resources: [
            {
              id: 'uuid',
              type: 'file',
              name: 'Career Development Plan.pdf',
              url: 'https://example.com/file.pdf',
              uploaded_by: 'uuid',
              uploaded_at: '2024-01-01T12:00:00Z',
              size: 2048000,
            },
          ],
          total: 5,
        },
      },
    },
  })
  async getResources(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    // This would query messages with file attachments in this conversation
    return {
      success: true,
      data: {
        resources: [
          {
            id: 'uuid',
            type: 'file',
            name: 'Career Development Plan.pdf',
            url: 'https://example.com/file.pdf',
            uploaded_by: 'uuid',
            uploaded_at: '2024-01-01T12:00:00Z',
            size: 2048000,
          },
        ],
        total: 5,
        by_type: {
          pdf: 3,
          doc: 1,
          link: 1,
        },
      },
    };
  }
}
