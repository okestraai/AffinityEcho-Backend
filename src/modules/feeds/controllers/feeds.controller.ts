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
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FeedsService } from '../services/feeds.service';
import { FeedPostsService } from '../services/feed-posts.service';
import { FeedEngagementService } from '../services/feed-engagement.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { QueryFeedDto } from '../dto/query-feed.dto';
import { CreateFeedCommentDto } from '../dto/create-comment.dto';
import { ShareFeedItemDto } from '../dto/share-feed-item.dto';

@ApiTags('Feeds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feeds')
export class FeedsController {
  constructor(
    private readonly feedsService: FeedsService,
    private readonly feedPostsService: FeedPostsService,
    private readonly feedEngagementService: FeedEngagementService,
  ) {}

  // ============ FEED AGGREGATION ============
  @Get()
  @ApiOperation({ summary: 'Get aggregated feed (posts, topics, nooks)' })
  async getAggregatedFeed(@Req() req: any, @Query() query: QueryFeedDto) {
    const userId = req.user.sub;
    return this.feedsService.getAggregatedFeed(userId, query);
  }

  // ============ STANDALONE POSTS ============
  @Post('posts')
  @ApiOperation({ summary: 'Create a standalone feed post' })
  @ApiBody({ type: CreatePostDto })
  async createPost(@Req() req: any, @Body() dto: CreatePostDto) {
    const userId = req.user.sub;
    return this.feedPostsService.createPost(userId, dto);
  }

  @Get('posts/:postId')
  @ApiOperation({ summary: 'Get feed post by ID' })
  @ApiParam({ name: 'postId', description: 'Feed post ID' })
  async getPostById(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.sub;
    return this.feedPostsService.getPostById(postId, userId);
  }

  @Get('users/:userId/posts')
  @ApiOperation({ summary: 'Get posts by user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async getUserPosts(
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.feedPostsService.getUserPosts(userId, page, limit);
  }

  @Put('posts/:postId')
  @ApiOperation({ summary: 'Update feed post' })
  @ApiParam({ name: 'postId', description: 'Feed post ID' })
  @ApiBody({ type: CreatePostDto })
  async updatePost(
    @Req() req: any,
    @Param('postId') postId: string,
    @Body() dto: Partial<CreatePostDto>,
  ) {
    const userId = req.user.sub;
    return this.feedPostsService.updatePost(postId, userId, dto);
  }

  @Delete('posts/:postId')
  @ApiOperation({ summary: 'Delete feed post' })
  @ApiParam({ name: 'postId', description: 'Feed post ID' })
  async deletePost(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.sub;
    return this.feedPostsService.deletePost(postId, userId);
  }

  @Post('posts/:postId/pin')
  @ApiOperation({ summary: 'Pin a feed post' })
  @ApiParam({ name: 'postId', description: 'Feed post ID' })
  async pinPost(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.sub;
    return this.feedPostsService.pinPost(postId, userId);
  }

  @Delete('posts/:postId/pin')
  @ApiOperation({ summary: 'Unpin a feed post' })
  @ApiParam({ name: 'postId', description: 'Feed post ID' })
  async unpinPost(@Req() req: any, @Param('postId') postId: string) {
    const userId = req.user.sub;
    return this.feedPostsService.unpinPost(postId, userId);
  }

  // ============ LIKES ============
  @Post(':contentType/:contentId/like')
  @ApiOperation({ summary: 'Like/Unlike a feed item' })
  @ApiParam({ name: 'contentType', description: 'Content type (post, topic, nook_message)' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async toggleLike(
    @Req() req: any,
    @Param('contentType') contentType: 'post' | 'topic' | 'nook_message',
    @Param('contentId') contentId: string,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.toggleLike(contentType, contentId, userId);
  }

  // ============ COMMENTS ============
  @Post(':contentType/:contentId/comments')
  @ApiOperation({ summary: 'Add comment to feed item' })
  @ApiParam({ name: 'contentType', description: 'Content type (post, topic, nook_message)' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ type: CreateFeedCommentDto })
  async addComment(
    @Req() req: any,
    @Param('contentType') contentType: 'post' | 'topic' | 'nook_message',
    @Param('contentId') contentId: string,
    @Body() dto: CreateFeedCommentDto,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.addComment(contentType, contentId, userId, dto);
  }

  @Get(':contentType/:contentId/comments')
  @ApiOperation({ summary: 'Get comments for feed item' })
  @ApiParam({ name: 'contentType', description: 'Content type (post, topic, nook_message)' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async getComments(
    @Param('contentType') contentType: 'post' | 'topic' | 'nook_message',
    @Param('contentId') contentId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.feedEngagementService.getComments(contentType, contentId, page, limit);
  }

  // ============ SHARES ============
  @Post(':contentType/:contentId/share')
  @ApiOperation({ summary: 'Share a feed item' })
  @ApiParam({ name: 'contentType', description: 'Content type (post, topic, nook_message)' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  @ApiBody({ type: ShareFeedItemDto })
  async shareItem(
    @Req() req: any,
    @Param('contentType') contentType: 'post' | 'topic' | 'nook_message',
    @Param('contentId') contentId: string,
    @Body() dto: ShareFeedItemDto,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.shareItem(contentType, contentId, userId, dto);
  }

  @Delete(':contentType/:contentId/share')
  @ApiOperation({ summary: 'Unshare a feed item' })
  @ApiParam({ name: 'contentType', description: 'Content type (post, topic, nook_message)' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async unshareItem(
    @Req() req: any,
    @Param('contentType') contentType: 'post' | 'topic' | 'nook_message',
    @Param('contentId') contentId: string,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.unshareItem(contentType, contentId, userId);
  }

  // ============ BOOKMARKS ============
  @Post(':contentType/:contentId/bookmark')
  @ApiOperation({ summary: 'Bookmark/Unbookmark a feed item' })
  @ApiParam({ name: 'contentType', description: 'Content type (post, topic, nook_message)' })
  @ApiParam({ name: 'contentId', description: 'Content ID' })
  async toggleBookmark(
    @Req() req: any,
    @Param('contentType') contentType: 'post' | 'topic' | 'nook_message',
    @Param('contentId') contentId: string,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.toggleBookmark(contentType, contentId, userId);
  }

  @Get('bookmarks')
  @ApiOperation({ summary: 'Get user bookmarks' })
  async getUserBookmarks(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub;
    return this.feedEngagementService.getUserBookmarks(userId, page, limit);
  }
}
