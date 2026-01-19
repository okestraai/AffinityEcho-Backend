import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
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
import { MentorshipBookmarksService } from '../services/mentorship-bookmarks.service';
import { BookmarkDto } from '../dto/bookmark.dto';

@ApiTags('Mentorship - Bookmarks')
@Controller('mentorship/bookmarks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MentorshipBookmarksController {
  constructor(private readonly bookmarksService: MentorshipBookmarksService) {}

  @Post()
  @ApiOperation({
    summary: 'Bookmark profile',
    description: 'Bookmark a mentor/mentee for later',
  })
  @ApiCreatedResponse({
    description: 'Profile bookmarked successfully',
    schema: {
      example: {
        message: 'Bookmark created successfully',
        bookmark: {
          id: 'uuid',
          user_id: 'uuid',
          bookmarked_user_id: 'uuid',
          notes: 'Great expertise in leadership',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or already bookmarked',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User to bookmark not found' })
  async createBookmark(
    @CurrentUser() user: any,
    @Body() bookmarkDto: BookmarkDto,
  ) {
    return this.bookmarksService.createBookmark(user.userId, bookmarkDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get bookmarks',
    description: 'Get user bookmarked profiles',
  })
  @ApiOkResponse({
    description: 'Bookmarks retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          notes: 'Great expertise in leadership',
          created_at: '2024-01-15T10:00:00Z',
          bookmarked_user: {
            id: 'uuid',
            username: 'TechLeader_Sarah',
            avatar: '👩🏾‍💼',
            mentor_bio: 'VP of Engineering...',
            expertise: ['Technical Leadership'],
            response_time: '24 hours',
            languages: ['English'],
            career_level: 'Senior',
            location: 'San Francisco',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBookmarks(@CurrentUser() user: any) {
    return this.bookmarksService.getBookmarks(user.userId);
  }

  @Delete(':bookmarkedUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove bookmark',
    description: 'Remove bookmark from profile',
  })
  @ApiParam({
    name: 'bookmarkedUserId',
    description: 'Bookmarked User ID',
    example: 'uuid',
  })
  @ApiOkResponse({
    description: 'Bookmark removed successfully',
    schema: {
      example: {
        message: 'Bookmark deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async deleteBookmark(
    @CurrentUser() user: any,
    @Param('bookmarkedUserId', ParseUUIDPipe) bookmarkedUserId: string,
  ) {
    return this.bookmarksService.deleteBookmark(user.userId, bookmarkedUserId);
  }

  @Patch(':bookmarkedUserId')
  @ApiOperation({
    summary: 'Update bookmark',
    description: 'Update bookmark notes',
  })
  @ApiParam({
    name: 'bookmarkedUserId',
    description: 'Bookmarked User ID',
    example: 'uuid',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['notes'],
      properties: {
        notes: { type: 'string', example: 'Updated notes about this mentor' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Bookmark updated successfully',
    schema: {
      example: {
        message: 'Bookmark updated successfully',
        bookmark: {
          id: 'uuid',
          notes: 'Updated notes about this mentor',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Bookmark not found' })
  async updateBookmark(
    @CurrentUser() user: any,
    @Param('bookmarkedUserId', ParseUUIDPipe) bookmarkedUserId: string,
    @Body('notes') notes: string,
  ) {
    return this.bookmarksService.updateBookmark(
      user.userId,
      bookmarkedUserId,
      notes,
    );
  }
}
