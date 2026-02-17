// referral.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReferralService } from '../services/referral.service';
import { ReferralLikesService } from '../services/referral-likes.service';
import { ReferralBookmarksService } from '../services/referral-bookmarks.service';
import { ReferralCommentsService } from '../services/referral-comments.service';
import { ReferralConnectionsService } from '../services/referral-connections.service';
import { IdentityRevealService } from '../services/identity-reveal.service';
import {
  CreateReferralDto,
  UpdateReferralDto,
  GetReferralsQueryDto,
} from '../dto/referral.dto';
import { CreateCommentDto } from '../dto/comment.dto';
import {
  SendConnectionRequestDto,
  UpdateConnectionProgressDto,
  AddConnectionNotesDto,
} from '../dto/connection.dto';
import { RequestIdentityRevealDto } from '../dto/identity-reveal.dto';

@ApiTags('Referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ReferralController {
  constructor(
    private referralService: ReferralService,
    private likesService: ReferralLikesService,
    private bookmarksService: ReferralBookmarksService,
    private commentsService: ReferralCommentsService,
    private connectionsService: ReferralConnectionsService,
    private identityRevealService: IdentityRevealService,
  ) {}

  // ========== REFERRAL POSTS ==========

  @Get()
  @ApiOperation({
    summary: 'Get all referral posts',
    description:
      'Retrieve paginated referral posts with filters. Supports filtering by type, status, scope, search term, and sorting options.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['request', 'offer', 'all'],
    description: 'Filter by referral type',
    example: 'request',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['open', 'closed', 'all'],
    description: 'Filter by post status',
    example: 'open',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['global', 'company', 'all'],
    description: 'Filter by visibility scope',
    example: 'global',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for filtering posts',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['recent', 'popular', 'relevant'],
    description: 'Sort order for results',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results per page (max 100)',
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset for pagination',
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Referrals retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid-string',
            userId: 'uuid-string',
            type: 'request',
            title: 'Looking for Software Engineer referral at Google',
            company: 'Google',
            jobTitle: 'Senior Software Engineer',
            jobLink: 'https://careers.google.com/jobs/123',
            description: 'Experienced full-stack developer...',
            scope: 'global',
            status: 'open',
            availableSlots: null,
            totalSlots: null,
            tags: ['software-engineering', 'react'],
            requiredSkills: ['JavaScript', 'React'],
            preferredExperience: '5+ years',
            viewsCount: 45,
            likesCount: 12,
            commentsCount: 8,
            bookmarksCount: 6,
            connectionRequestsCount: 3,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            lastActivityAt: '2024-01-01T12:00:00Z',
            expiresAt: null,
            author: {
              id: 'uuid-string',
              username: 'TechSeeker2024',
              avatar: '🚀',
              jobTitle: 'Software Engineer',
              company: 'Tech Corp',
              bio: 'Passionate developer...',
              skills: ['React', 'Node.js'],
              yearsExperience: 5,
            },
            isLiked: false,
            isBookmarked: false,
          },
        ],
        pagination: {
          total: 150,
          limit: 50,
          offset: 0,
          hasMore: true,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReferrals(
    @CurrentUser() user: any,
    @Query() query: GetReferralsQueryDto,
  ) {
    return this.referralService.getReferrals(user.userId, query);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search referrals',
    description: 'Search referrals by query string with optional filters',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query',
    example: 'software engineer',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['request', 'offer', 'all'],
  })
  @ApiQuery({
    name: 'companies',
    required: false,
    type: String,
    description: 'Comma-separated company names',
    example: 'Google,Microsoft',
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    type: String,
    description: 'Comma-separated tags',
    example: 'software-engineering,react',
  })
  @ApiQuery({
    name: 'skills',
    required: false,
    type: String,
    description: 'Comma-separated skills',
    example: 'JavaScript,React',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid-string',
            type: 'request',
            title: 'Looking for Software Engineer referral',
            company: 'Google',
            jobTitle: 'Senior Software Engineer',
            description: 'Experienced developer...',
            scope: 'global',
            status: 'open',
            tags: ['software-engineering', 'react'],
            viewsCount: 45,
            likesCount: 12,
            author: {
              id: 'uuid-string',
              username: 'TechSeeker2024',
              avatar: '🚀',
            },
            isLiked: false,
            isBookmarked: false,
          },
        ],
        total: 15,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async searchReferrals(
    @CurrentUser() user: any,
    @Query('q') query: string,
    @Query('type') type?: string,
    @Query('companies') companies?: string,
    @Query('tags') tags?: string,
    @Query('skills') skills?: string,
  ) {
    return this.referralService.searchReferrals(user.userId, {
      query,
      type,
      companies: companies?.split(','),
      tags: tags?.split(','),
      skills: skills?.split(','),
    });
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get referral statistics',
    description:
      'Get comprehensive statistics including global and user-specific data',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved',
    schema: {
      example: {
        success: true,
        data: {
          global: {
            totalPosts: 150,
            openRequests: 45,
            openOffers: 32,
            totalCompanies: 67,
            totalViews: 4523,
            totalConnections: 89,
            acceptedConnections: 45,
            successfulReferrals: 23,
            interviewsScheduled: 15,
            offersReceived: 8,
            successRate: '25.8',
          },
          user: {
            postsCreated: 5,
            openPosts: 3,
            connectionsSent: 8,
            connectionsReceived: 12,
            acceptedConnections: 10,
            pendingConnections: 6,
            likes: 23,
            bookmarks: 15,
            comments: 18,
            successRate: '50.0',
            responseRate: '83.3',
          },
          breakdown: {
            connectionsByStatus: {
              sent: { pending: 3, accepted: 4, rejected: 1 },
              received: { pending: 3, accepted: 6, rejected: 3 },
            },
            postsByType: { requests: 3, offers: 2 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Failed to fetch statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStats(@CurrentUser() user: any) {
    return this.referralService.getStatistics(user.userId);
  }

  @Get('my-activity')
  @ApiOperation({
    summary: "Get user's referral activity",
    description:
      'Get comprehensive activity including posts, connections, engagement, and timeline',
  })
  @ApiResponse({
    status: 200,
    description: 'Activity retrieved',
    schema: {
      example: {
        success: true,
        data: {
          posts: [
            {
              id: 'uuid-string',
              type: 'request',
              title: 'Looking for referral...',
              company: 'Google',
              status: 'open',
              viewsCount: 45,
              likesCount: 12,
              commentsCount: 8,
              connectionRequestsCount: 5,
              createdAt: '2024-01-01T00:00:00Z',
            },
          ],
          connections: {
            sent: [],
            received: [],
            total: 20,
            pending: 6,
            accepted: 10,
          },
          engagement: {
            likes: 23,
            bookmarks: 15,
            comments: 18,
            total: 56,
          },
          recentActivity: [
            {
              type: 'connection_received',
              timestamp: '2024-01-15T10:30:00Z',
              data: { connectionId: 'uuid-string', status: 'pending' },
            },
          ],
          activityStats: {
            postsThisMonth: 3,
            connectionsThisMonth: 5,
            engagementThisMonth: 12,
          },
          summary: {
            totalPosts: 5,
            activePosts: 3,
            totalConnections: 20,
            totalEngagements: 56,
            totalViews: 234,
            totalLikesReceived: 67,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Failed to fetch activity' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyActivity(@CurrentUser() user: any) {
    return this.referralService.getUserActivity(user.userId);
  }

  @Get('liked')
  @ApiOperation({ summary: "Get user's liked referrals" })
  @ApiResponse({
    status: 200,
    description: 'Liked referrals retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            referral_post_id: 'uuid-string',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getLikedReferrals(@CurrentUser() user: any) {
    return this.likesService.getUserLikes(user.userId);
  }

  @Get('bookmarked')
  @ApiOperation({ summary: "Get user's bookmarked referrals" })
  @ApiResponse({
    status: 200,
    description: 'Bookmarked referrals retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            referral_post_id: 'uuid-string',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBookmarkedReferrals(@CurrentUser() user: any) {
    return this.bookmarksService.getUserBookmarks(user.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single referral post',
    description: 'Retrieve detailed information about a specific referral',
  })
  @ApiParam({
    name: 'id',
    description: 'Referral post UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Referral retrieved',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          userId: 'uuid-string',
          type: 'offer',
          title: 'Can refer for Microsoft roles',
          company: 'Microsoft',
          jobTitle: null,
          jobLink: null,
          description: 'Senior PM at Microsoft...',
          scope: 'global',
          status: 'open',
          availableSlots: 2,
          totalSlots: 5,
          tags: ['microsoft', 'product-manager'],
          requiredSkills: ['Product Management'],
          viewsCount: 89,
          likesCount: 24,
          commentsCount: 15,
          bookmarksCount: 18,
          connectionRequestsCount: 8,
          createdAt: '2024-01-01T00:00:00Z',
          author: {
            id: 'uuid-string',
            username: 'MSFTInsider',
            avatar: '💼',
            jobTitle: 'Senior PM',
            company: 'Microsoft',
          },
          isLiked: false,
          isBookmarked: true,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReferralById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.referralService.getReferralById(user.userId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create referral post',
    description: 'Create a new referral post (request or offer)',
  })
  @ApiResponse({
    status: 201,
    description: 'Referral created',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          type: 'request',
          status: 'open',
          createdAt: '2024-01-01T00:00:00Z',
        },
        message: 'Referral post created successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input',
    schema: {
      example: {
        statusCode: 400,
        message: ['title should not be empty'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: CreateReferralDto })
  async createReferral(
    @CurrentUser() user: any,
    @Body() dto: CreateReferralDto,
  ) {
    return this.referralService.createReferral(user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update referral post',
    description: 'Update existing referral (owner only)',
  })
  @ApiParam({
    name: 'id',
    description: 'Referral post UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Referral updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        message: 'Referral updated successfully',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Not authorized',
    schema: {
      example: {
        statusCode: 403,
        message: 'Not authorized to update this referral',
        error: 'Forbidden',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: UpdateReferralDto })
  async updateReferral(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateReferralDto,
  ) {
    return this.referralService.updateReferral(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete referral post',
    description: 'Permanently delete referral (owner only)',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 200,
    description: 'Referral deleted',
    schema: {
      example: {
        success: true,
        message: 'Referral deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteReferral(@CurrentUser() user: any, @Param('id') id: string) {
    return this.referralService.deleteReferral(user.userId, id);
  }

  @Post(':id/view')
  @ApiOperation({
    summary: 'Increment view count',
    description: 'Track view for analytics',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 200,
    description: 'View count incremented',
    schema: {
      example: {
        success: true,
        data: { viewsCount: 46 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async incrementView(@Param('id') id: string) {
    return this.referralService.incrementViewCount(id);
  }

  // ========== LIKES ==========

  @Post(':id/like')
  @ApiOperation({
    summary: 'Like a referral post',
    description: 'Add like to referral post',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 200,
    description: 'Referral liked',
    schema: {
      example: {
        success: true,
        data: { liked: true, likesCount: 13 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Already liked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async likeReferral(@CurrentUser() user: any, @Param('id') id: string) {
    return this.likesService.likeReferral(user.userId, id);
  }

  @Delete(':id/like')
  @ApiOperation({
    summary: 'Unlike a referral post',
    description: 'Remove like from referral post',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 200,
    description: 'Like removed',
    schema: {
      example: {
        success: true,
        data: { liked: false, likesCount: 12 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unlikeReferral(@CurrentUser() user: any, @Param('id') id: string) {
    return this.likesService.unlikeReferral(user.userId, id);
  }

  // ========== BOOKMARKS ==========

  @Post(':id/bookmark')
  @ApiOperation({
    summary: 'Bookmark a referral post',
    description: 'Save referral for later',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 200,
    description: 'Referral bookmarked',
    schema: {
      example: {
        success: true,
        data: { bookmarked: true, bookmarksCount: 7 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Already bookmarked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bookmarkReferral(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bookmarksService.bookmarkReferral(user.userId, id);
  }

  @Delete(':id/bookmark')
  @ApiOperation({
    summary: 'Remove bookmark',
    description: 'Remove saved referral',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 200,
    description: 'Bookmark removed',
    schema: {
      example: {
        success: true,
        data: { bookmarked: false, bookmarksCount: 6 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeBookmark(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bookmarksService.removeBookmark(user.userId, id);
  }

  // ========== COMMENTS ==========

  @Get(':id/comments')
  @ApiOperation({
    summary: 'Get comments for a referral',
    description: 'Retrieve paginated comments',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: 'Comments retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid-string',
            referral_post_id: 'uuid-string',
            user_id: 'uuid-string',
            content: 'Great opportunity!',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            author: {
              id: 'uuid-string',
              username: 'Commenter123',
              avatar: '👤',
            },
          },
        ],
        pagination: { total: 8, limit: 50, offset: 0 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getComments(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.commentsService.getComments(id, limit, offset);
  }

  @Post(':id/comments')
  @ApiOperation({
    summary: 'Create comment',
    description: 'Add comment to referral post',
  })
  @ApiParam({ name: 'id', description: 'Referral post UUID' })
  @ApiResponse({
    status: 201,
    description: 'Comment created',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          referral_post_id: 'uuid-string',
          user_id: 'uuid-string',
          content: 'Great opportunity!',
          created_at: '2024-01-01T00:00:00Z',
        },
        message: 'Comment created successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: CreateCommentDto })
  async createComment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.createComment(user.userId, id, dto);
  }

  @Patch('comments/:commentId')
  @ApiOperation({
    summary: 'Update comment',
    description: 'Edit comment (owner only)',
  })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Comment updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          content: 'Updated comment text',
          updated_at: '2024-01-02T00:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: CreateCommentDto })
  async updateComment(
    @CurrentUser() user: any,
    @Param('commentId') commentId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.updateComment(user.userId, commentId, dto);
  }

  @Delete('comments/:commentId')
  @ApiOperation({
    summary: 'Delete comment',
    description: 'Remove comment (owner only)',
  })
  @ApiParam({ name: 'commentId', description: 'Comment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Comment deleted',
    schema: {
      example: {
        success: true,
        message: 'Comment deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteComment(
    @CurrentUser() user: any,
    @Param('commentId') commentId: string,
  ) {
    return this.commentsService.deleteComment(user.userId, commentId);
  }

  // ========== CONNECTIONS ==========

  @Get('connections')
  @ApiOperation({
    summary: 'Get all connections for current user',
    description: 'Retrieve sent and received connections',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'accepted', 'rejected', 'all'],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['sent', 'received', 'all'],
  })
  @ApiResponse({
    status: 200,
    description: 'Connections retrieved',
    schema: {
      example: {
        success: true,
        data: {
          sent: [
            {
              id: 'uuid-string',
              referralPostId: 'uuid-string',
              status: 'accepted',
              message: 'Hi! I am interested...',
              identityRevealed: false,
              createdAt: '2024-01-01T00:00:00Z',
              referralPost: {
                title: 'Can refer for Microsoft',
                company: 'Microsoft',
              },
              otherUser: {
                username: 'Anonymous User',
                avatar: '👤',
              },
            },
          ],
          received: [],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnections(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.connectionsService.getUserConnections(
      user.userId,
      status,
      type,
    );
  }

  @Get('connections/:connectionId')
  @ApiOperation({
    summary: 'Get single connection',
    description: 'Get detailed connection info',
  })
  @ApiParam({ name: 'connectionId', description: 'Connection UUID' })
  @ApiResponse({
    status: 200,
    description: 'Connection retrieved',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'accepted',
          message: 'Hi! I am interested...',
          identityRevealed: false,
          referralSubmitted: true,
          interviewScheduled: false,
          offerReceived: false,
          createdAt: '2024-01-01T00:00:00Z',
          sender: {
            username: 'JobSeeker123',
            avatar: '👤',
          },
          receiver: {
            username: 'Referrer456',
            avatar: '💼',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnection(
    @CurrentUser() user: any,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connectionsService.getConnectionById(user.userId, connectionId);
  }

  @Post(':referralId/connect')
  @ApiOperation({
    summary: 'Send connection request',
    description: 'Request to connect with referral poster',
  })
  @ApiParam({ name: 'referralId', description: 'Referral post UUID' })
  @ApiResponse({
    status: 201,
    description: 'Connection request sent',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'pending',
          createdAt: '2024-01-01T00:00:00Z',
        },
        message: 'Connection request sent successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request',
    schema: {
      example: {
        statusCode: 400,
        message: 'You already have a connection request for this referral',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: SendConnectionRequestDto })
  async sendConnectionRequest(
    @CurrentUser() user: any,
    @Param('referralId') referralId: string,
    @Body() dto: SendConnectionRequestDto,
  ) {
    return this.connectionsService.sendConnectionRequest(
      user.userId,
      referralId,
      dto,
    );
  }

  @Post('connections/:connectionId/accept')
  @ApiOperation({
    summary: 'Accept connection request',
    description: 'Accept pending connection (receiver only)',
  })
  @ApiParam({ name: 'connectionId', description: 'Connection UUID' })
  @ApiResponse({
    status: 200,
    description: 'Connection accepted',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'accepted',
        },
        message: 'Connection accepted successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Connection not pending' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async acceptConnection(
    @CurrentUser() user: any,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connectionsService.acceptConnection(user.userId, connectionId);
  }

  @Post('connections/:connectionId/reject')
  @ApiOperation({
    summary: 'Reject connection request',
    description: 'Reject pending connection (receiver only)',
  })
  @ApiParam({ name: 'connectionId', description: 'Connection UUID' })
  @ApiResponse({
    status: 200,
    description: 'Connection rejected',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'rejected',
        },
        message: 'Connection rejected',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Connection not pending' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async rejectConnection(
    @CurrentUser() user: any,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connectionsService.rejectConnection(user.userId, connectionId);
  }

  @Patch('connections/:connectionId/progress')
  @ApiOperation({
    summary: 'Update connection progress',
    description: 'Update referral progress tracking',
  })
  @ApiParam({ name: 'connectionId', description: 'Connection UUID' })
  @ApiResponse({
    status: 200,
    description: 'Progress updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          referralSubmitted: true,
          interviewScheduled: true,
          offerReceived: false,
        },
        message: 'Progress updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Connection not accepted' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: UpdateConnectionProgressDto })
  async updateProgress(
    @CurrentUser() user: any,
    @Param('connectionId') connectionId: string,
    @Body() dto: UpdateConnectionProgressDto,
  ) {
    return this.connectionsService.updateProgress(
      user.userId,
      connectionId,
      dto,
    );
  }

  @Patch('connections/:connectionId/notes')
  @ApiOperation({
    summary: 'Add connection notes',
    description: 'Add private notes to connection',
  })
  @ApiParam({ name: 'connectionId', description: 'Connection UUID' })
  @ApiResponse({
    status: 200,
    description: 'Notes added',
    schema: {
      example: {
        success: true,
        data: { id: 'uuid-string' },
        message: 'Notes added successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid note type' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: AddConnectionNotesDto })
  async addNotes(
    @CurrentUser() user: any,
    @Param('connectionId') connectionId: string,
    @Body() dto: AddConnectionNotesDto,
  ) {
    return this.connectionsService.addNotes(user.userId, connectionId, dto);
  }

  // ========== IDENTITY REVEALS ==========

  @Get('identity-reveals')
  @ApiOperation({
    summary: 'Get identity reveal requests',
    description: 'Get all identity reveal requests for user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'accepted', 'rejected', 'all'],
  })
  @ApiResponse({
    status: 200,
    description: 'Requests retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid-string',
            connectionId: 'uuid-string',
            requesterId: 'uuid-string',
            responderId: 'uuid-string',
            status: 'pending',
            requesterMessage: "I'd like to continue...",
            createdAt: '2024-01-01T00:00:00Z',
            requester: {
              username: 'Anonymous User',
              avatar: '👤',
            },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getIdentityReveals(
    @CurrentUser() user: any,
    @Query('status') status?: string,
  ) {
    return this.identityRevealService.getUserReveals(user.userId, status);
  }

  @Post('connections/:connectionId/reveal-identity')
  @ApiOperation({
    summary: 'Request identity reveal',
    description: 'Request to reveal identities in connection',
  })
  @ApiParam({ name: 'connectionId', description: 'Connection UUID' })
  @ApiResponse({
    status: 201,
    description: 'Request sent',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'pending',
        },
        message: 'Identity reveal request sent',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Connection not accepted or already revealed',
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({ type: RequestIdentityRevealDto })
  async requestIdentityReveal(
    @CurrentUser() user: any,
    @Param('connectionId') connectionId: string,
    @Body() dto: RequestIdentityRevealDto,
  ) {
    return this.identityRevealService.requestReveal(
      user.userId,
      connectionId,
      dto,
    );
  }

  @Post('identity-reveals/:revealId/accept')
  @ApiOperation({
    summary: 'Accept identity reveal',
    description: 'Accept reveal request (responder only)',
  })
  @ApiParam({ name: 'revealId', description: 'Reveal request UUID' })
  @ApiResponse({
    status: 200,
    description: 'Identity revealed',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'accepted',
          connection: { identityRevealed: true },
        },
        message: 'Identity revealed successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Request not pending' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async acceptIdentityReveal(
    @CurrentUser() user: any,
    @Param('revealId') revealId: string,
  ) {
    return this.identityRevealService.acceptReveal(user.userId, revealId);
  }

  @Post('identity-reveals/:revealId/reject')
  @ApiOperation({
    summary: 'Reject identity reveal',
    description: 'Reject reveal request (responder only)',
  })
  @ApiParam({ name: 'revealId', description: 'Reveal request UUID' })
  @ApiResponse({
    status: 200,
    description: 'Request rejected',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid-string',
          status: 'rejected',
        },
        message: 'Identity reveal request rejected',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Request not pending' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async rejectIdentityReveal(
    @CurrentUser() user: any,
    @Param('revealId') revealId: string,
  ) {
    return this.identityRevealService.rejectReveal(user.userId, revealId);
  }
}
