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
  ApiParam,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MentorshipSessionsService } from '../services/mentorship-sessions.service';
import { CreateSessionDto } from '../dto/create-session.dto';
import { UpdateSessionDto } from '../dto/update-session.dto';
import { SessionStatusDto } from '../dto/session-status.dto';

@ApiTags('Mentorship - Sessions')
@Controller('mentorship/sessions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipSessionsController {
  constructor(private readonly sessionsService: MentorshipSessionsService) {}

  @Post('relationships/:relationshipId')
  @ApiOperation({
    summary: 'Schedule mentorship session',
    description: 'Schedule a new mentorship session',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
    example: 'uuid',
  })
  @ApiCreatedResponse({
    description: 'Session scheduled successfully',
    schema: {
      example: {
        message: 'Session created successfully',
        session: {
          id: 'uuid',
          scheduled_at: '2024-01-25T14:00:00Z',
          duration_minutes: 30,
          status: 'scheduled',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  @ApiBody({ type: CreateSessionDto })
  async createSession(
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
    @Body() createSessionDto: CreateSessionDto,
  ) {
    return this.sessionsService.createSession(relationshipId, createSessionDto);
  }

  @Get('relationships/:relationshipId')
  @ApiOperation({
    summary: 'Get relationship sessions',
    description: 'Get all sessions for a relationship',
  })
  @ApiParam({
    name: 'relationshipId',
    description: 'Relationship ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Sessions retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          scheduled_at: '2024-01-25T14:00:00Z',
          duration_minutes: 30,
          status: 'scheduled',
          agenda: 'Discuss career progression',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Relationship not found' })
  async getSessions(
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.sessionsService.getSessions(relationshipId);
  }

  @Get(':sessionId')
  @ApiOperation({
    summary: 'Get session details',
    description: 'Get specific session details',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID', example: 'uuid' })
  @ApiOkResponse({
    description: 'Session retrieved successfully',
    schema: {
      example: {
        id: 'uuid',
        scheduled_at: '2024-01-25T14:00:00Z',
        duration_minutes: 30,
        status: 'scheduled',
        agenda: 'Discuss career progression',
        relationship: {
          id: 'uuid',
          mentor: { id: 'uuid', username: 'TechLeader_Sarah' },
          mentee: { id: 'uuid', username: 'RisingProfessional123' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.sessionsService.getSession(sessionId);
  }

  @Patch(':sessionId')
  @ApiOperation({
    summary: 'Update session details',
    description: 'Update session details (agenda, meeting URL, etc.)',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID', example: 'uuid' })
  @ApiOkResponse({
    description: 'Session updated successfully',
    schema: {
      example: {
        message: 'Session updated successfully',
        session: {
          id: 'uuid',
          scheduled_at: '2024-01-26T14:00:00Z',
          agenda: 'Updated agenda',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiBody({ type: UpdateSessionDto })
  async updateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() updateSessionDto: UpdateSessionDto,
  ) {
    return this.sessionsService.updateSession(sessionId, updateSessionDto);
  }

  @Post(':sessionId/status')
  @ApiOperation({
    summary: 'Update session status',
    description: 'Complete, cancel, or reschedule session with single endpoint',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID', example: 'uuid' })
  @ApiOkResponse({
    description: 'Session status updated successfully',
    schema: {
      example: {
        message: 'Session completed successfully',
        session: {
          id: 'uuid',
          status: 'completed',
          mentor_rating: 5,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiBody({ type: SessionStatusDto })
  async updateSessionStatus(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: any,
    @Body() statusDto: SessionStatusDto,
  ) {
    return this.sessionsService.updateSessionStatus(
      sessionId,
      user.userId,
      statusDto,
    );
  }
}
