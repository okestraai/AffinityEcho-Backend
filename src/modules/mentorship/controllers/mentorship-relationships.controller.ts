import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Patch,
  HttpCode,
  HttpStatus,
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
import { MentorshipRelationshipsService } from '../services/mentorship-relationships.service';
import { RelationshipStatusDto } from '../dto/relationship-status.dto';
import { RelationshipUpdateDto } from '../dto/relationship-update.dto';

@ApiTags('Mentorship - Relationships')
@Controller('mentorship/relationships')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipRelationshipsController {
  constructor(
    private readonly relationshipsService: MentorshipRelationshipsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get mentorship relationships',
    description: 'Get current user mentorship relationships',
  })
  @ApiQuery({
    name: 'role',
    enum: ['mentor', 'mentee', 'both'],
    required: false,
    description: 'Filter by role',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description:
      'Filter by status (pending, accepted, active, completed, declined, cancelled)',
  })
  @ApiOkResponse({
    description: 'Relationships retrieved successfully',
    schema: {
      example: {
        asMentor: [
          {
            id: 'uuid',
            mentee: {
              id: 'uuid',
              username: 'RisingProfessional123',
              avatar: '🌟',
            },
            status: 'active',
            goals: 'Looking to advance to senior level...',
            startedAt: '2024-01-15T10:00:00Z',
          },
        ],
        asMentee: [
          {
            id: 'uuid',
            mentor: {
              id: 'uuid',
              username: 'ExperiencedLeader789',
              avatar: '👩🏾‍💼',
            },
            status: 'active',
            matchScore: 95,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRelationships(
    @CurrentUser() user: any,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.relationshipsService.getRelationships(
      user.userId,
      role,
      status,
    );
  }

  @Get(':relationshipId')
  @ApiOperation({
    summary: 'Get mentorship relationship details',
    description: 'Get specific relationship details',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Relationship retrieved successfully',
    schema: {
      example: {
        id: 'uuid',
        mentor: {
          id: 'uuid',
          username: 'TechLeader_Sarah',
          avatar: '👩🏾‍💼',
        },
        mentee: {
          id: 'uuid',
          username: 'RisingProfessional123',
          avatar: '🌟',
        },
        status: 'active',
        goals: 'Career advancement...',
        sessions: [
          {
            id: 'uuid',
            scheduled_at: '2024-01-25T14:00:00Z',
            status: 'scheduled',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  async getRelationship(
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.relationshipsService.getRelationship(relationshipId);
  }

  @Post(':relationshipId/status')
  @ApiOperation({
    summary: 'Update relationship status',
    description:
      'Accept, decline, complete, or cancel relationship with single endpoint',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Relationship status updated successfully',
    schema: {
      example: {
        message: 'Relationship accepted successfully',
        relationship: {
          id: 'uuid',
          status: 'accepted',
          started_at: '2024-01-15T10:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  @ApiBody({ type: RelationshipStatusDto })
  async updateRelationshipStatus(
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @CurrentUser() user: any,
    @Body() statusDto: RelationshipStatusDto,
  ) {
    return this.relationshipsService.updateRelationshipStatus(
      relationshipId,
      user.userId,
      statusDto,
    );
  }

  @Patch(':relationshipId')
  @ApiOperation({
    summary: 'Update relationship details',
    description:
      'Update relationship details including contact, frequency, goals, etc.',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Relationship updated successfully',
    schema: {
      example: {
        message: 'Relationship updated successfully',
        relationship: {
          id: 'uuid',
          meeting_frequency: 'weekly',
          last_contact_at: '2024-01-20T15:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  @ApiBody({ type: RelationshipUpdateDto })
  async updateRelationshipDetails(
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @CurrentUser() user: any,
    @Body() updateDto: RelationshipUpdateDto,
  ) {
    return this.relationshipsService.updateRelationshipDetails(
      relationshipId,
      user.userId,
      updateDto,
    );
  }

  @Post(':relationshipId/report')
  @ApiOperation({
    summary: 'Report relationship',
    description: 'Report an issue with a mentorship relationship',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
    example: 'uuid',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason', 'details'],
      properties: {
        reason: {
          type: 'string',
          enum: [
            'inappropriate_behavior',
            'no_response',
            'unprofessional',
            'other',
          ],
          example: 'inappropriate_behavior',
        },
        details: { type: 'string', example: 'Description of the issue' },
        evidence: {
          type: 'array',
          items: { type: 'string' },
          example: ['message_id_1', 'message_id_2'],
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Report submitted successfully',
    schema: {
      example: {
        message: 'Report submitted successfully',
        reportId: 'report_1705312800000',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not part of relationship',
  })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  async reportRelationship(
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @CurrentUser() user: any,
    @Body() reportData: any,
  ) {
    return this.relationshipsService.reportRelationship(
      relationshipId,
      user.userId,
      reportData,
    );
  }

  @Get('stats/me')
  @ApiOperation({
    summary: 'Get mentorship stats',
    description: 'Get mentorship statistics for current user',
  })
  @ApiOkResponse({
    description: 'Stats retrieved successfully',
    schema: {
      example: {
        asMentor: {
          totalMentees: 8,
          activeMentees: 5,
          completedRelationships: 3,
          totalSessions: 45,
          completedSessions: 42,
          averageRating: 4.8,
        },
        asMentee: {
          totalMentors: 2,
          activeMentors: 1,
          completedRelationships: 1,
          totalSessions: 12,
          completedSessions: 10,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyStats(@CurrentUser() user: any) {
    return this.relationshipsService.getUserStats(user.userId);
  }
}
