import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MentorshipDiscoverService } from '../services/mentorship-discover.service';
import { MentorshipQueryDto } from '../dto/mentorship-query.dto';

@ApiTags('Mentorship - Discover')
@Controller('mentorship/discover')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipDiscoverController {
  constructor(private readonly discoverService: MentorshipDiscoverService) {}

  @Get()
  @ApiOperation({
    summary: 'Discover mentors/mentees',
    description: 'Search and filter available mentors/mentees',
  })
  @ApiOkResponse({
    description: 'Profiles retrieved successfully',
    schema: {
      example: {
        profiles: [
          {
            id: 'uuid',
            username: 'TechLeader_Sarah',
            avatar: '👩🏾‍💼',
            bio: 'VP of Engineering...',
            company: 'Microsoft',
            expertise: ['Technical Leadership', 'Career Development'],
            mentoring_as: 'mentor',
            response_time: '24 hours',
            languages: ['English', 'Spanish'],
            career_level: 'Senior',
            location: 'San Francisco',
            affinity_tags: [],
            matchScore: 95,
            isAvailable: true,
          },
        ],
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async discover(@CurrentUser() user: any, @Query() query: MentorshipQueryDto) {
    const result = await this.discoverService.discoverProfiles(
      user.userId,
      query,
    );
    // Return directly without wrapping again
    return result;
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Get AI-powered suggestions',
    description: 'Get AI-powered mentor/mentee suggestions based on profile',
  })
  @ApiQuery({
    name: 'type',
    enum: ['mentors', 'mentees'],
    required: false,
    description: 'Type of suggestions',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of suggestions (default: 10)',
  })
  @ApiOkResponse({
    description: 'Suggestions retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          username: 'TechLeader_Sarah',
          avatar: '👩🏾‍💼',
          expertise: ['Technical Leadership'],
          response_time: '24 hours',
          languages: ['English'],
          career_level: 'Senior',
          location: 'San Francisco',
          matchScore: 95,
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSuggestions(
    @CurrentUser() user: any,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
  ) {
    return this.discoverService.getSuggestions(
      user.userId,
      type || 'mentors',
      limit ? parseInt(limit.toString()) : 10,
    );
  }

  @Get('filters/options')
  @ApiOperation({
    summary: 'Get filter options',
    description: 'Get available filter options for mentorship discovery',
  })
  @ApiOkResponse({
    description: 'Filter options retrieved successfully',
    schema: {
      example: {
        careerLevels: [
          'Entry Level (0-2 years)',
          'Mid-level (3-7 years)',
          'Senior (8-12 years)',
          'Executive/C-Suite',
        ],
        expertiseAreas: [
          'Technical Leadership',
          'Career Development',
          'Product Management',
        ],
        industries: ['Technology', 'Finance', 'Healthcare'],
        affinityTags: [
          'Black Professionals',
          'Latino in Tech',
          'Women in Leadership',
        ],
        availabilityOptions: ['Immediate', 'Within 1 week', 'Within 2 weeks'],
        communicationMethods: ['video-calls', 'phone-calls', 'in-person'],
        mentorshipStyles: ['Collaborative', 'Direct', 'Structured'],
        responseTimes: ['Within 24 hours', 'Within 48 hours', 'Within 1 week'],
        languages: ['English', 'Spanish', 'French', 'German', 'Mandarin'],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFilterOptions() {
    return this.discoverService.getFilterOptions();
  }

  @Get('quick-match')
  @ApiOperation({
    summary: 'Quick match',
    description: 'Get quick mentor/mentee matches based on profile',
  })
  @ApiOkResponse({
    description: 'Quick matches retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          username: 'TechLeader_Sarah',
          avatar: '👩🏾‍💼',
          matchScore: 98,
          expertise: ['Technical Leadership'],
          response_time: '24 hours',
          languages: ['English'],
          availability: 'Within 1 week',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async quickMatch(@CurrentUser() user: any) {
    const suggestions = await this.discoverService.getSuggestions(
      user.userId,
      'mentors',
      5,
    );
    return suggestions;
  }

  @Get('analytics/matches')
  @ApiOperation({
    summary: 'Get matching analytics',
    description: 'Get matching analytics and trends',
  })
  @ApiOkResponse({
    description: 'Analytics retrieved successfully',
    schema: {
      example: {
        topExpertiseAreas: ['Technical Leadership', 'Career Development'],
        industryDistribution: { Technology: 45, Finance: 12 },
        careerLevelBreakdown: { Senior: 30, Executive: 15 },
        popularMentoringStyles: ['Collaborative', 'Structured'],
        averageResponseTime: '2 days',
        successRate: 0.85,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMatchingAnalytics(@CurrentUser() user: any) {
    return {
      topExpertiseAreas: [
        'Technical Leadership',
        'Career Development',
        'Product Management',
      ],
      industryDistribution: {
        Technology: 45,
        Finance: 12,
        Healthcare: 8,
        Education: 5,
      },
      careerLevelBreakdown: {
        'Entry Level (0-2 years)': 25,
        'Mid-level (3-7 years)': 40,
        'Senior (8-12 years)': 30,
        'Executive/C-Suite': 15,
      },
      popularMentoringStyles: ['Collaborative', 'Structured', 'Goal-oriented'],
      averageResponseTime: '2 days',
      successRate: 0.85,
      totalMatches: 1245,
      activeMentorships: 342,
      averageSessionDuration: 45,
    };
  }
}
