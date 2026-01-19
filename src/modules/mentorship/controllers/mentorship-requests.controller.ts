import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
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
import { MentorshipRequestsService } from '../services/mentorship-requests.service';
import { MentorshipProfileService } from '../services/mentorship-profile.service';
import {
  CreateDirectRequestDto,
  RespondToDirectRequestDto,
  DirectRequestFilterDto,
} from '../dto/create-direct-request.dto';

@ApiTags('Mentorship - Direct Requests')
@Controller('mentorship/requests')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipRequestsController {
  constructor(
    private readonly requestsService: MentorshipRequestsService,
    private readonly profileService: MentorshipProfileService,
  ) {}

  @Post('direct')
  @ApiOperation({
    summary: 'Send direct mentorship request',
    description: 'Send a direct mentorship request to a specific user',
  })
  @ApiCreatedResponse({
    description: 'Direct request sent successfully',
    schema: {
      example: {
        success: true,
        message: 'Direct mentorship request sent successfully',
        data: {
          request: {
            id: 'uuid',
            targetUserId: 'uuid',
            requestType: 'mentor_request',
            message: 'Would love to learn from your experience!',
            status: 'pending',
            createdAt: '2024-01-15T10:00:00Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or validation failed',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Target user not found' })
  @ApiResponse({ status: 409, description: 'Request already exists' })
  async sendDirectRequest(
    @CurrentUser() user: any,
    @Body() createDirectRequestDto: CreateDirectRequestDto,
  ) {
    return await this.requestsService.sendDirectRequest(
      user.userId,
      createDirectRequestDto,
    );
  }

  @Get('direct/received')
  @ApiOperation({
    summary: 'Get received direct requests',
    description: 'Get direct mentorship requests sent to you with pagination',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (pending, accepted, declined, cancelled)',
  })
  @ApiQuery({
    name: 'requestType',
    required: false,
    description: 'Filter by request type (mentor_request, mentee_request)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 20, max: 100)',
    type: Number,
  })
  @ApiQuery({
    name: 'markAsRead',
    required: false,
    description: 'Mark fetched requests as read (default: false)',
    type: Boolean,
  })
  @ApiOkResponse({
    description: 'Direct requests retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Direct requests retrieved successfully',
        data: {
          requests: [
            {
              id: 'uuid',
              requesterId: 'uuid',
              requestType: 'mentor_request',
              message: 'Would love to learn from your experience!',
              status: 'pending',
              createdAt: '2024-01-15T10:00:00Z',
              requester: {
                id: 'uuid',
                username: 'Sarah Chen',
                avatar: '👩‍💻',
                jobTitle: 'Software Engineer',
                company: 'StartupCo',
              },
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            limit: 20,
            pages: 1,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReceivedDirectRequests(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('requestType') requestType?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('markAsRead', new DefaultValuePipe(false))
    markAsRead: boolean = false,
  ) {
    // Validate limit
    if (limit > 100) {
      limit = 100;
    }

    const filterDto: DirectRequestFilterDto = {
      status,
      requestType,
      page,
      limit,
      markAsRead,
    };

    return this.requestsService.getDirectRequestsByReceiver(
      user.userId,
      filterDto,
    );
  }

  @Get('direct/sent')
  @ApiOperation({
    summary: 'Get sent direct requests',
    description: 'Get direct mentorship requests you sent with pagination',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (pending, accepted, declined, cancelled)',
  })
  @ApiQuery({
    name: 'requestType',
    required: false,
    description: 'Filter by request type (mentor_request, mentee_request)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 20, max: 100)',
    type: Number,
  })
  @ApiQuery({
    name: 'markAsRead',
    required: false,
    description: 'Mark fetched requests as read (default: false)',
    type: Boolean,
  })
  @ApiOkResponse({
    description: 'Sent direct requests retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Sent direct requests retrieved successfully',
        data: {
          requests: [
            {
              id: 'uuid',
              targetUserId: 'uuid',
              requestType: 'mentor_request',
              message: 'Would love to learn from your experience!',
              status: 'pending',
              createdAt: '2024-01-15T10:00:00Z',
              targetUser: {
                id: 'uuid',
                username: 'TechLeader_Sarah',
                avatar: '👩🏾‍💼',
                jobTitle: 'VP of Engineering',
                company: 'Microsoft',
              },
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            limit: 20,
            pages: 1,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSentDirectRequests(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('requestType') requestType?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('markAsRead', new DefaultValuePipe(false))
    markAsRead: boolean = false,
  ) {
    // Validate limit
    if (limit > 100) {
      limit = 100;
    }

    const filterDto: DirectRequestFilterDto = {
      status,
      requestType,
      page,
      limit,
      markAsRead,
    };

    return this.requestsService.getDirectRequestsBySender(
      user.userId,
      filterDto,
    );
  }

  @Get('direct/all')
  @ApiOperation({
    summary: 'Get all direct requests (sent + received)',
    description:
      'Get all direct mentorship requests including both sent and received',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (pending, accepted, declined, cancelled)',
  })
  @ApiQuery({
    name: 'requestType',
    required: false,
    description: 'Filter by request type (mentor_request, mentee_request)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 20, max: 100)',
    type: Number,
  })
  @ApiQuery({
    name: 'markAsRead',
    required: false,
    description: 'Mark fetched requests as read (default: false)',
    type: Boolean,
  })
  @ApiOkResponse({
    description: 'All direct requests retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'All direct requests retrieved successfully',
        data: {
          requests: [
            {
              id: 'uuid',
              requestType: 'mentor_request',
              status: 'pending',
              createdAt: '2024-01-15T10:00:00Z',
              requestContext: {
                isSent: true,
                isReceived: false,
                userRole: 'mentee',
                otherUser: {
                  id: 'uuid',
                  username: 'TechLeader_Sarah',
                  avatar: '👩🏾‍💼',
                  jobTitle: 'VP of Engineering',
                },
              },
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            limit: 20,
            pages: 1,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllDirectRequests(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('requestType') requestType?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('markAsRead', new DefaultValuePipe(false))
    markAsRead: boolean = false,
  ) {
    // Validate limit
    if (limit > 100) {
      limit = 100;
    }

    const filterDto: DirectRequestFilterDto = {
      status,
      requestType,
      page,
      limit,
      markAsRead,
    };

    return this.requestsService.getAllDirectRequestsForUser(
      user.userId,
      filterDto,
    );
  }

  @Get('direct/metrics')
  @ApiOperation({
    summary: 'Get direct request metrics',
    description: 'Get metrics and unread counts for direct mentorship requests',
  })
  @ApiOkResponse({
    description: 'Metrics retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Request metrics retrieved successfully',
        data: {
          total: 15,
          sent: {
            total: 8,
            unread: 2,
            byStatus: {
              pending: 3,
              accepted: 4,
              declined: 1,
              cancelled: 0,
            },
            byType: {
              mentor_requests: 5,
              mentee_requests: 3,
            },
          },
          received: {
            total: 7,
            unread: 3,
            byStatus: {
              pending: 2,
              accepted: 4,
              declined: 1,
              cancelled: 0,
            },
            byType: {
              mentor_requests: 4,
              mentee_requests: 3,
            },
          },
          totalUnread: 5,
          pendingReceivedUnread: 2,
          recentActivity: {
            last7Days: 5,
            last30Days: 12,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDirectRequestMetrics(@CurrentUser() user: any) {
    return this.requestsService.getDirectRequestMetrics(user.userId);
  }

  @Get('direct/stats')
  @ApiOperation({
    summary: 'Get mentorship request statistics',
    description: 'Get statistics about your mentorship requests',
  })
  @ApiOkResponse({
    description: 'Statistics retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Request statistics retrieved successfully',
        data: {
          sent: {
            pending: 2,
            accepted: 1,
            declined: 0,
            cancelled: 1,
          },
          received: {
            pending: 3,
            accepted: 2,
            declined: 1,
            cancelled: 0,
          },
          activeMentorships: 3,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDirectRequestStats(@CurrentUser() user: any) {
    return this.requestsService.getDirectRequestStats(user.userId);
  }

  @Get('direct/check/:targetUserId')
  @ApiOperation({
    summary: 'Check if request sent to specific user',
    description: 'Check if current user has sent a request to a specific user',
  })
  @ApiParam({
    name: 'targetUserId',
    description: 'Target user ID to check',
    example: 'uuid',
  })
  @ApiQuery({
    name: 'requestType',
    required: false,
    description:
      'Filter by specific request type (mentor_request, mentee_request)',
  })
  @ApiOkResponse({
    description: 'Request check completed',
    schema: {
      example: {
        success: true,
        hasSentRequest: true,
        message: 'Found 2 request(s)',
        data: {
          latestRequest: {
            id: 'uuid',
            requestType: 'mentor_request',
            status: 'pending',
            createdAt: '2024-01-15T10:00:00Z',
          },
          pendingRequest: {
            id: 'uuid',
            requestType: 'mentor_request',
            status: 'pending',
          },
          activeRequest: null,
          summary: {
            totalRequests: 2,
            pending: 1,
            accepted: 0,
            declined: 1,
            cancelled: 0,
          },
          hasPendingRequest: true,
          hasActiveRequest: false,
          latestStatus: 'pending',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkIfRequestSentToUser(
    @CurrentUser() user: any,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
    @Query('requestType') requestType?: 'mentor_request' | 'mentee_request',
  ) {
    return this.requestsService.checkIfRequestSentToUser(
      user.userId,
      targetUserId,
      requestType,
    );
  }

  @Get('direct/:requestId')
  @ApiOperation({
    summary: 'Get direct request details',
    description: 'Get specific direct mentorship request details',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Direct request ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Direct request retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Direct request retrieved successfully',
        data: {
          id: 'uuid',
          requesterId: 'uuid',
          targetUserId: 'uuid',
          requestType: 'mentor_request',
          message: 'Would love to learn from your experience!',
          status: 'pending',
          createdAt: '2024-01-15T10:00:00Z',
          requester: {
            id: 'uuid',
            username: 'Sarah Chen',
            avatar: '👩‍💻',
            jobTitle: 'Software Engineer',
            company: 'StartupCo',
          },
          targetUser: {
            id: 'uuid',
            username: 'TechLeader_Sarah',
            avatar: '👩🏾‍💼',
            jobTitle: 'VP of Engineering',
            company: 'Microsoft',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not authorized to view this request',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async getDirectRequest(
    @CurrentUser() user: any,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.requestsService.getDirectRequest(requestId, user.userId);
  }

  @Post('direct/:requestId/respond')
  @ApiOperation({
    summary: 'Respond to direct mentorship request',
    description:
      'Respond to a direct mentorship request (accept/decline/cancel). Receivers can accept/decline. Senders can cancel.',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Direct request ID',
    example: 'uuid',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['accept', 'decline', 'cancel'],
          description:
            'accept (receiver), decline (receiver), cancel (sender only)',
        },
        message: {
          type: 'string',
          description: 'Optional response message (for accept/decline)',
        },
      },
      required: ['action'],
    },
  })
  @ApiOkResponse({
    description: 'Response submitted successfully',
    schema: {
      example: {
        success: true,
        message: 'Request accepted successfully',
        data: {
          request: {
            id: 'uuid',
            status: 'accepted',
            respondedAt: '2024-01-15T11:00:00Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or invalid action',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not authorized to respond',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async respondToDirectRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: any,
    @Body() respondDto: RespondToDirectRequestDto,
  ) {
    return this.requestsService.respondToDirectRequest(
      requestId,
      user.userId,
      respondDto,
    );
  }

  @Post('direct/:requestId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark direct request as read',
    description: 'Mark a specific direct request as read by the current user',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Direct request ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Request marked as read successfully',
    schema: {
      example: {
        success: true,
        message: 'Request marked as read',
        data: {
          request: {
            id: 'uuid',
            is_read_by_requester: true,
            updated_at: '2024-01-15T11:30:00Z',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not authorized to mark this request as read',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async markDirectRequestAsRead(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: any,
  ) {
    return this.requestsService.markDirectRequestAsRead(requestId, user.userId);
  }

  @Post('direct/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all requests as read',
    description:
      'Mark all direct requests as read (optionally filter by sent/received)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['sent', 'received'],
    description: 'Filter by request type (sent or received)',
  })
  @ApiOkResponse({
    description: 'Requests marked as read successfully',
    schema: {
      example: {
        success: true,
        message: 'Marked 5 requests as read',
        data: {
          count: 5,
          requestType: 'received',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllDirectRequestsAsRead(
    @CurrentUser() user: any,
    @Query('type') type?: 'sent' | 'received',
  ) {
    return this.requestsService.markAllDirectRequestsAsRead(user.userId, type);
  }

  @Delete('direct/:requestId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete direct mentorship request',
    description:
      'Delete/cancel a direct mentorship request (only for pending requests sent by you)',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Direct request ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Direct request deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Request deleted successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete non-pending request',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only delete your own requests',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async deleteDirectRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: any,
  ) {
    return this.requestsService.deleteDirectRequest(requestId, user.userId);
  }

  // In MentorshipRequestsController class

  @Get('my-mentors')
  @ApiOperation({
    summary: 'Get my mentors',
    description:
      'Get all mentors (active mentorship relationships) for current user',
  })
  @ApiOkResponse({
    description: 'Mentors retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Mentors retrieved successfully',
        data: {
          mentors: [
            {
              id: 'uuid',
              source: 'direct_request',
              type: 'mentor',
              mentor: {
                id: 'uuid',
                username: 'John Doe',
                email: 'john@example.com',
                avatar: '👨‍💻',
                job_title: 'Senior Software Engineer',
                company_encrypted: 'encrypted_company',
                location: 'San Francisco, CA',
                years_experience: 8,
                mentor_expertise: ['React', 'Node.js', 'AWS'],
                mentor_industries: ['Technology', 'Finance'],
                mentor_bio: 'Passionate about mentoring junior developers',
                mentoring_as: 'mentor',
                is_willing_to_mentor: true,
              },
              connectionType: 'mentor_request',
              message: 'Would love to learn from your experience!',
              connectedSince: '2024-01-15T10:00:00Z',
              status: 'accepted',
            },
            {
              id: 'uuid2',
              source: 'relationship',
              type: 'mentor',
              mentor: {
                id: 'uuid2',
                username: 'Sarah Chen',
                avatar: '👩‍💼',
                job_title: 'Engineering Manager',
                company_encrypted: 'encrypted_company',
                location: 'New York, NY',
                years_experience: 10,
                mentor_expertise: ['Leadership', 'Product Management'],
                mentor_bio: 'Helping engineers grow into leadership roles',
              },
              matchScore: 85,
              connectedSince: '2024-01-20T14:30:00Z',
              status: 'active',
              topic: 'Career advancement to leadership',
            },
          ],
          stats: {
            total: 2,
            fromDirectRequests: 1,
            fromRelationships: 1,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyMentors(@CurrentUser() user: any) {
    return this.requestsService.getMyMentors(user.userId);
  }

  @Get('my-mentees')
  @ApiOperation({
    summary: 'Get my mentees',
    description: 'Get all mentees (people you are mentoring) for current user',
  })
  @ApiOkResponse({
    description: 'Mentees retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Mentees retrieved successfully',
        data: {
          mentees: [
            {
              id: 'uuid',
              source: 'direct_request',
              type: 'mentee',
              mentee: {
                id: 'uuid',
                username: 'Alex Johnson',
                email: 'alex@example.com',
                avatar: '👨‍🎓',
                job_title: 'Junior Developer',
                company_encrypted: 'encrypted_company',
                location: 'Austin, TX',
                years_experience: 2,
                mentor_expertise: ['JavaScript', 'HTML/CSS'],
                mentor_bio: 'Eager to learn and grow in software development',
                mentoring_as: 'mentee',
                is_willing_to_mentor: false,
              },
              connectionType: 'mentee_request',
              message: 'Looking for guidance on career growth',
              connectedSince: '2024-02-01T09:00:00Z',
              status: 'accepted',
            },
            {
              id: 'uuid2',
              source: 'relationship',
              type: 'mentee',
              mentee: {
                id: 'uuid2',
                username: 'Emma Wilson',
                avatar: '👩‍🎨',
                job_title: 'Product Designer',
                company_encrypted: 'encrypted_company',
                location: 'Seattle, WA',
                years_experience: 3,
                mentor_expertise: ['UI/UX', 'Figma'],
                mentor_bio: 'Transitioning from design to product management',
              },
              matchScore: 90,
              connectedSince: '2024-02-10T11:00:00Z',
              status: 'active',
              topic: 'Transition from design to product management',
            },
          ],
          stats: {
            total: 2,
            fromDirectRequests: 1,
            fromRelationships: 1,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyMentees(@CurrentUser() user: any) {
    return this.requestsService.getMyMentees(user.userId);
  }
}
