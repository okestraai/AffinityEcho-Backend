import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MentorshipProfileService } from '../services/mentorship-profile.service';
import { CreateMentorProfileDto } from '../dto/create-mentor-profile.dto';
import { UpdateMentorProfileDto } from '../dto/update-mentor-profile.dto';
import { CreateMenteeProfileDto } from '../dto/create-mentee-profile.dto';
import { UpdateMenteeProfileDto } from '../dto/update-mentee-profile.dto';

// Interface for authenticated user
interface AuthenticatedRequest {
  user: {
    id: string;
    sub?: string;
    [key: string]: any;
  };
}

@ApiTags('mentorship-profiles')
@ApiBearerAuth('access-token')
@Controller('mentorship-profiles')
@UseGuards(JwtAuthGuard)
export class MentorshipProfileController {
  constructor(
    private readonly mentorshipProfileService: MentorshipProfileService,
  ) {}

  @Post('mentor/setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Setup mentor profile' })
  @ApiResponse({
    status: 201,
    description: 'Mentor profile created successfully',
    schema: {
      example: {
        success: true,
        message: 'Mentor profile created successfully',
        data: {
          id: 'user_id',
          username: 'john_doe',
          // ... other profile fields
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: CreateMentorProfileDto })
  async setupMentorProfile(
    @Request() req: AuthenticatedRequest,
    @Body() createMentorProfileDto: CreateMentorProfileDto,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.setupMentorProfile(
      userId,
      createMentorProfileDto,
    );
  }

  @Put('mentor/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update mentor profile' })
  @ApiResponse({
    status: 200,
    description: 'Mentor profile updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Mentor profile updated successfully',
        data: {
          id: 'user_id',
          username: 'john_doe',
          // ... updated profile fields
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found or not a mentor' })
  @ApiBody({ type: UpdateMentorProfileDto })
  async updateMentorProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateMentorProfileDto: UpdateMentorProfileDto,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.updateMentorProfile(
      userId,
      updateMentorProfileDto,
    );
  }

  @Post('mentee/setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Setup mentee profile' })
  @ApiResponse({
    status: 201,
    description: 'Mentee profile created successfully',
    schema: {
      example: {
        success: true,
        message: 'Mentee profile created successfully',
        data: {
          id: 'user_id',
          username: 'john_doe',
          // ... other profile fields
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBody({ type: CreateMenteeProfileDto })
  async setupMenteeProfile(
    @Request() req: AuthenticatedRequest,
    @Body() createMenteeProfileDto: CreateMenteeProfileDto,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.setupMenteeProfile(
      userId,
      createMenteeProfileDto,
    );
  }

  @Put('mentee/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update mentee profile' })
  @ApiResponse({
    status: 200,
    description: 'Mentee profile updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Mentee profile updated successfully',
        data: {
          id: 'user_id',
          username: 'john_doe',
          // ... updated profile fields
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found or not a mentee' })
  @ApiBody({ type: UpdateMenteeProfileDto })
  async updateMenteeProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateMenteeProfileDto: UpdateMenteeProfileDto,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.updateMenteeProfile(
      userId,
      updateMenteeProfileDto,
    );
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          username: 'john_doe',
          email: 'john@example.com',
          avatar: 'https://example.com/avatar.jpg',
          basicProfile: {
            bio: 'Senior software engineer...',
            jobTitle: 'Senior Developer',
            location: 'San Francisco, USA',
            yearsExperience: 10,
            skills: ['JavaScript', 'React', 'Node.js'],
            linkedinUrl: 'https://linkedin.com/in/johndoe',
            careerLevel: 'Senior',
            company: 'Tech Corp',
            affinityTags: [],
          },
          mentorProfile: {
            bio: 'I enjoy mentoring...',
            expertise: ['React', 'TypeScript'],
            industries: ['Technology'],
            availability: 'Weekends, 2 hours per week',
            responseTime: '24-48 hours',
            style: 'Structured sessions',
            languages: ['English'],
            hourlyRate: 50,
            isWillingToMentor: true,
            isActive: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
          menteeProfile: null,
          status: {
            mentoringAs: 'mentor',
            communicationMethod: 'video_call',
            isActiveMentor: true,
            isActiveMentee: false,
          },
          stats: {
            reputationScore: 85,
            mentorshipSessionsCompleted: 5,
            totalPosts: 12,
            totalComments: 45,
            helpfulVotesReceived: 23,
            followersCount: 120,
            followingCount: 85,
          },
          timestamps: {
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2024-01-15T10:30:00Z',
            lastActiveAt: '2024-01-15T10:30:00Z',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(@Request() req: AuthenticatedRequest) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.getProfile(userId, userId);
  }

  @Get('check-exists')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if profile exists' })
  @ApiResponse({
    status: 200,
    description: 'Profile existence checked successfully',
    schema: {
      example: {
        hasProfile: true,
        hasMentorProfile: false,
        hasMenteeProfile: true,
        isActiveMentor: false,
        isActiveMentee: true,
        mentoringAs: 'mentee',
      },
    },
  })
  async checkProfileExists(@Request() req: AuthenticatedRequest) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.checkProfileExists(userId);
  }

  @Get('check-requirement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check profile requirements for mentorship' })
  @ApiResponse({
    status: 200,
    description: 'Requirements checked successfully',
    schema: {
      example: {
        success: true,
        message: 'Requirements checked successfully',
        data: {
          hasProfile: true,
          hasMentorProfile: true,
          hasMenteeProfile: false,
          missingSharedFields: [],
          missingMentorFields: ['expertise'],
          missingMenteeFields: [],
          canCreateRequest: false,
        },
      },
    },
  })
  async checkProfileRequirements(@Request() req: AuthenticatedRequest) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.checkProfileRequirement(userId);
  }

  @Delete('deactivate/:section')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate mentor or mentee profile section' })
  @ApiParam({
    name: 'section',
    enum: ['mentor', 'mentee'],
    description: 'Profile section to deactivate',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile section deactivated successfully',
    schema: {
      example: {
        success: true,
        message: 'mentor profile deactivated successfully',
        data: {
          id: 'user_id',
          is_active_mentor: false,
          // ... other updated fields
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async deactivateProfileSection(
    @Request() req: AuthenticatedRequest,
    @Param('section') section: 'mentor' | 'mentee',
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.deactivateProfileSection(
      userId,
      section,
    );
  }

  @Post('submit-feedback')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit feedback about mentorship experience' })
  @ApiResponse({
    status: 201,
    description: 'Feedback submitted successfully',
    schema: {
      example: {
        success: true,
        message: 'Feedback submitted successfully',
        data: {
          feedbackId: 'feedback_1234567890',
          rating: 5,
          comment: 'Great mentorship session!',
          // ... other feedback data
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Failed to submit feedback' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { rating: { type: 'number' }, feedback: { type: 'string' } },
      required: ['rating'],
    },
  })
  async submitFeedback(
    @Request() req: AuthenticatedRequest,
    @Body() feedbackData: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new NotFoundException('User not authenticated');
    }
    return this.mentorshipProfileService.submitFeedback(userId, feedbackData);
  }

  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get profile by user ID (admin/support)' })
  @ApiParam({
    name: 'userId',
    description: 'User ID to retrieve profile for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          id: 'user_id',
          username: 'john_doe',
          // ... full profile data
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfileById(@Param('userId') userId: string, @Request() req: AuthenticatedRequest) {
    const currentUserId = req.user?.id || req.user?.sub;
    return this.mentorshipProfileService.getProfile(userId, currentUserId);
  }

  @Get(':userId/is-active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if profile is active (admin/support)' })
  @ApiParam({
    name: 'userId',
    description: 'User ID to check',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile status checked successfully',
    schema: {
      example: {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        isActive: true,
      },
    },
  })
  async isProfileActive(@Param('userId') userId: string) {
    const isActive =
      await this.mentorshipProfileService.isProfileActive(userId);
    return {
      userId,
      isActive,
    };
  }
}
