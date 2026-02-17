// user-discovery.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserDiscoveryService } from '../services/user-discovery.service';

@ApiTags('User Discovery')
@Controller('user-discovery')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class UserDiscoveryController {
  constructor(private userDiscoveryService: UserDiscoveryService) {}

  @Get('connectable-users')
  @ApiOperation({
    summary: 'Get users to connect with',
    description:
      'Get users that the current user can start a conversation with',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, job title, or bio',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of users to return (default: 20)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Pagination offset (default: 0)',
  })
  @ApiQuery({
    name: 'exclude_existing',
    required: false,
    type: Boolean,
    description: 'Exclude users with existing conversations (default: true)',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['mentor', 'mentee', 'both'],
    description: 'Filter by user role',
  })
  @ApiQuery({
    name: 'skills',
    required: false,
    description: 'Comma-separated list of skills to filter by',
  })
  @ApiQuery({
    name: 'company_type',
    required: false,
    description: 'Filter by company type',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          users: [
            {
              id: 'uuid',
              username: 'user123',
              avatar: '👤',
              job_title: 'Software Engineer',
              company_encrypted: 'Tech Corp',
              skills: ['React', 'Node.js'],
              mutual_connections: 3,
              can_message: true,
            },
          ],
          pagination: {
            total: 100,
            limit: 20,
            offset: 0,
            has_more: true,
          },
        },
      },
    },
  })
  async getConnectableUsers(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query('exclude_existing', new DefaultValuePipe('true'))
    excludeExisting?: string,
    @Query('role') role?: 'mentor' | 'mentee' | 'both',
    @Query('skills') skills?: string,
    @Query('company_type') companyType?: string,
  ) {
    const excludeExistingBool = excludeExisting !== 'false';

    return this.userDiscoveryService.getConnectableUsers(user.userId, {
      search,
      limit,
      offset,
      exclude_existing: excludeExistingBool,
      role,
      skills: skills ? skills.split(',') : [],
      company_type: companyType,
    });
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Get user suggestions',
    description:
      'Get suggested users to connect with based on profile similarity',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of suggestions to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggestions retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          suggestions: [
            {
              id: 'uuid',
              username: 'user123',
              avatar: '👤',
              job_title: 'Software Engineer',
              company_encrypted: 'Tech Corp',
              skills: ['React', 'Node.js'],
              mentoring_as: 'mentor',
            },
          ],
          based_on: {
            skills: ['React', 'TypeScript'],
            mentoring_role: 'mentee',
          },
        },
      },
    },
  })
  async getUserSuggestions(
    @CurrentUser() user: any,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.userDiscoveryService.getUserSuggestions(user.userId, limit);
  }
}
