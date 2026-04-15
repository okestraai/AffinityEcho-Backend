import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  Request,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
interface AuthenticatedRequest {
  user?: { id?: string; sub?: string };
}
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MentorshipProfileService } from '../services/mentorship-profile.service';
import { MentorshipDiscoverService } from '../services/mentorship-discover.service';

@ApiTags('Mentorship - Miscellaneous')
@Controller('mentorship')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipMiscController {
  constructor(
    private readonly profileService: MentorshipProfileService,
    private readonly discoverService: MentorshipDiscoverService,
  ) {}

  @Patch('toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle mentor/mentee active status',
    description: 'Toggle the active status of mentor or mentee profile section',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['section'],
      properties: {
        section: {
          type: 'string',
          enum: ['mentor', 'mentee'],
          example: 'mentor',
          description: 'Profile section to toggle',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Profile section toggled successfully',
    schema: {
      example: {
        success: true,
        message: 'mentor profile activated successfully',
        data: {
          isActiveMentor: true,
          isActiveMentee: false,
          mentoringAs: 'mentor',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async toggleProfileSection(
    @CurrentUser() user: any,
    @Body() body: { section: 'mentor' | 'mentee' },
  ) {
    const section = body?.section;
    if (!section || !['mentor', 'mentee'].includes(section)) {
      throw new BadRequestException(
        'section is required and must be "mentor" or "mentee"',
      );
    }
    const userId = user?.userId || user?.sub;
    return this.profileService.toggleProfileSection(userId, section);
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Get mentorship notifications',
    description: 'Get mentorship-related notifications',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by type (requests, sessions, updates, all)',
  })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'Show only unread notifications',
  })
  @ApiOkResponse({
    description: 'Notifications retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          type: 'mentorship_request_received',
          title: 'New Mentorship Request',
          message: 'Sarah sent you a mentorship request',
          is_read: false,
          created_at: '2024-01-15T10:00:00Z',
          action_url: '/mentorship/requests/uuid',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMentorshipNotifications(
    @CurrentUser() user: any,
    @Query('type') type?: string,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    return [
      {
        id: 'notif_1',
        type: 'mentorship_request_received',
        title: 'New Mentorship Request',
        message: 'Sarah sent you a mentorship request',
        is_read: false,
        created_at: new Date().toISOString(),
        action_url: '/mentorship/requests/uuid',
      },
      {
        id: 'notif_2',
        type: 'session_scheduled',
        title: 'Session Scheduled',
        message: 'Your mentorship session is scheduled for tomorrow',
        is_read: true,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        action_url: '/mentorship/sessions/uuid',
      },
    ];
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Mark a mentorship notification as read',
  })
  @ApiParam({
    name: 'notificationId',
    description: 'Notification ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Notification marked as read',
    schema: {
      example: {
        message: 'Notification marked as read',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markNotificationAsRead(
    @CurrentUser() user: any,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return { message: 'Notification marked as read' };
  }

  @Post('feedback')
  @ApiOperation({
    summary: 'Submit feedback',
    description: 'Submit general feedback about mentorship feature',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['rating', 'feedback'],
      properties: {
        rating: { type: 'number', minimum: 1, maximum: 5, example: 5 },
        feedback: {
          type: 'string',
          example: 'Great feature, helped me find a mentor!',
        },
        suggestions: {
          type: 'string',
          example: 'Would love to see video profiles',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Feedback submitted successfully',
    schema: {
      example: {
        message: 'Feedback submitted successfully',
        feedbackId: 'feedback_1705312800000',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async submitFeedback(@CurrentUser() user: any, @Body() feedbackData: any) {
    return this.profileService.submitFeedback(user.userId, feedbackData);
  }

  @Get('goals')
  @ApiOperation({
    summary: 'Get mentorship goals',
    description: 'Get mentorship goals for current user',
  })
  @ApiOkResponse({
    description: 'Goals retrieved successfully',
    schema: {
      example: {
        currentGoals: [
          'Advance to senior level within 12 months',
          'Improve public speaking skills',
        ],
        completedGoals: ['Complete technical certification'],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGoals(@CurrentUser() user: any) {
    return {
      currentGoals: [
        'Advance to senior level within 12 months',
        'Improve public speaking skills',
        'Build professional network',
      ],
      completedGoals: [
        'Complete technical certification',
        'Attend 3 industry conferences',
      ],
      nextMilestone: 'Schedule monthly check-ins with mentor',
    };
  }

  @Post('goals')
  @ApiOperation({
    summary: 'Add mentorship goal',
    description: 'Add a new mentorship goal',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['goal'],
      properties: {
        goal: { type: 'string', example: 'Improve leadership skills' },
        deadline: { type: 'string', format: 'date', example: '2024-06-30' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          example: 'high',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Goal added successfully',
    schema: {
      example: {
        message: 'Goal added successfully',
        goalId: 'goal_uuid',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addGoal(@CurrentUser() user: any, @Body() goalData: any) {
    return {
      message: 'Goal added successfully',
      goalId: 'goal_' + Date.now(),
      goal: goalData.goal,
      userId: user.userId,
    };
  }

  @Get('profile/:userId')
  @ApiOperation({ summary: 'Get mentorship profile by user ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiOkResponse({ description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfileById(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const currentUserId = req.user?.id || req.user?.sub;
    return this.profileService.getProfile(userId, currentUserId);
  }
}
