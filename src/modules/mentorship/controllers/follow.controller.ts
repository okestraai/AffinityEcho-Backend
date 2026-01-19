import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FollowService } from '../services/follow.service';

@ApiTags('Mentorship - Follow')
@Controller('mentorship/follow')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  @Post(':userId')
  @ApiOperation({
    summary: 'Follow a user',
    description: 'Follow another user (mentor or mentee)',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID to follow',
    example: '52eb7df3-233b-4f1c-a825-1aa17ca204d9',
  })
  @ApiOkResponse({
    description: 'Successfully followed user',
    schema: {
      example: {
        success: true,
        message: 'Successfully followed user',
        data: {
          followId: 'uuid',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Already following or cannot follow self',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async followUser(
    @CurrentUser() user: any,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.followService.followUser(user.userId, userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfollow a user',
    description: 'Unfollow a user you are currently following',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID to unfollow',
    example: '52eb7df3-233b-4f1c-a825-1aa17ca204d9',
  })
  @ApiOkResponse({
    description: 'Successfully unfollowed user',
    schema: {
      example: {
        success: true,
        message: 'Successfully unfollowed user',
        data: {},
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Follow relationship not found' })
  async unfollowUser(
    @CurrentUser() user: any,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.followService.unfollowUser(user.userId, userId);
  }

  @Get('following')
  @ApiOperation({
    summary: 'Get users you follow',
    description: 'Get list of users you are following',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['mentors', 'mentees', 'all'],
    description: 'Filter by user type',
  })
  @ApiOkResponse({
    description: 'Following list retrieved',
    schema: {
      example: {
        success: true,
        message: 'Following list retrieved successfully',
        data: {
          following: [
            {
              id: 'uuid',
              username: 'TechLeader_Sarah',
              avatar: '👩🏾‍💼',
              job_title: 'VP of Engineering',
              company_type: 'Microsoft',
              mentoring_as: 'mentor',
              followId: 'follow-uuid',
              followedAt: '2025-12-15T19:15:33.184Z',
            },
          ],
          total: 1,
        },
      },
    },
  })
  async getFollowing(@CurrentUser() user: any, @Query('type') type?: string) {
    return this.followService.getFollowing(user.userId, type);
  }

  @Get('followers')
  @ApiOperation({
    summary: 'Get your followers',
    description: 'Get list of users who follow you',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['mentors', 'mentees', 'all'],
    description: 'Filter by user type',
  })
  @ApiOkResponse({
    description: 'Followers list retrieved',
    schema: {
      example: {
        success: true,
        message: 'Followers list retrieved successfully',
        data: {
          followers: [
            {
              id: 'uuid',
              username: 'AspiringEngineer_Jay',
              avatar: '🌟',
              job_title: 'Junior Software Engineer',
              company_type: 'Salesforce',
              mentoring_as: 'mentee',
              followId: 'follow-uuid',
              followedAt: '2025-12-15T19:15:33.184Z',
            },
          ],
          total: 1,
        },
      },
    },
  })
  async getFollowers(@CurrentUser() user: any, @Query('type') type?: string) {
    return this.followService.getFollowers(user.userId, type);
  }

  @Get(':userId/status')
  @ApiOperation({
    summary: 'Check follow status',
    description: 'Check if you are following a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID to check',
    example: '52eb7df3-233b-4f1c-a825-1aa17ca204d9',
  })
  @ApiOkResponse({
    description: 'Follow status checked',
    schema: {
      example: {
        success: true,
        message: 'Follow status retrieved',
        data: {
          isFollowing: true,
          followId: 'uuid',
          followedAt: '2025-12-15T19:15:33.184Z',
        },
      },
    },
  })
  async checkFollowStatus(
    @CurrentUser() user: any,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.followService.checkFollowStatus(user.userId, userId);
  }
}
