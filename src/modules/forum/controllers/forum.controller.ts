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
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ForumService } from '../services/forum.service';
import { TopicService } from '../services/topic.service';
import { CommentService } from '../services/comment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateForumDto } from '../dto/create-forum.dto';
import { UpdateForumDto } from '../dto/update-forum.dto';
import { CreateTopicDto } from '../dto/create-topic.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { TopicReactionDto } from '../dto/topic-reaction.dto';
import { CommentReactionDto } from '../dto/comment-reaction.dto';
import { ForumFiltersDto } from '../dto/forum-filters.dto';
import logger from '../../../common/utils/logger.util';

@ApiTags('Forum')
@Controller('forum') // This will automatically become /api/v1/forum due to global prefix
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ForumController {
  constructor(
    private readonly forumService: ForumService,
    private readonly topicService: TopicService,
    private readonly commentService: CommentService,
  ) {}

  // ========== NEW ENDPOINTS ==========

  @Get('metrics/local/:companyName')
  @ApiOperation({
    summary: 'Get local scope forum metrics',
    description:
      'Fetch metrics for local scope forums based on provided company name',
  })
  @ApiParam({ name: 'companyName', description: 'Company Name' })
  @ApiResponse({
    status: 200,
    description: 'Local forum metrics retrieved successfully',
  })
  async getLocalForumMetrics(@Param('companyName') companyName: string) {
    logger.info('Getting local forum metrics for company', {
      companyName,
    });
    return this.forumService.getLocalForumMetrics(companyName);
  }

  @Get('recent-discussions/:companyName')
  @ApiOperation({
    summary: 'Get recent discussions across all topics',
    description:
      'Fetch recent discussions across all topics with filtering. Returns global topics and local topics matching provided company name.',
  })
  @ApiParam({ name: 'companyName', description: 'Company Name' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['relevant', 'recent', 'popular', 'trending'],
  })
  @ApiQuery({
    name: 'timeFilter',
    required: false,
    enum: ['all', 'today', 'week', 'month'],
  })
  @ApiQuery({ name: 'isGlobal', required: false, type: Boolean })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({
    name: 'hashtag',
    required: false,
    type: String,
    description: 'Filter topics by hashtag',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Recent discussions retrieved successfully',
  })
  async getRecentDiscussions(
    @Param('companyName') companyName: string,
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('timeFilter') timeFilter?: string,
    @Query('isGlobal') isGlobal?: string,
    @Query('category') category?: string,
    @Query('hashtag') hashtag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: ForumFiltersDto = {
      search,
      sortBy: sortBy as any,
      timeFilter: timeFilter as any,
      companyName, // Use the provided companyName from path parameter
      isGlobal: isGlobal ? isGlobal === 'true' : undefined,
      category,
      hashtag,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    return this.topicService.findRecentDiscussions(
      filters,
      user.userId,
      companyName, // Pass the companyName from parameter instead of user.companyName
    );
  }
  @Get('metrics/global')
  @ApiOperation({
    summary: 'Get global communities forum metrics',
    description:
      'Fetch all global communities forum metrics sorted by highest metrics first',
  })
  @ApiResponse({
    status: 200,
    description: 'Global forum metrics retrieved successfully',
  })
  async getGlobalForumMetrics() {
    return this.forumService.getGlobalForumMetrics();
  }

  @Get('foundation/:companyName')
  @ApiOperation({
    summary: 'Get foundation forums with detailed metrics',
    description:
      'Fetch all foundation forums for a company with detailed metrics and analytics',
  })
  @ApiParam({ name: 'companyName', description: 'Company Name' })
  @ApiResponse({
    status: 200,
    description: 'Foundation forums with metrics retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'No foundation forums found for company',
  })
  async getFoundationForumsWithMetrics(
    @Param('companyName') companyName: string,
  ) {
    logger.info('Getting foundation forums with metrics for company', {
      companyName,
    });
    return this.forumService.getFoundationForumsWithMetrics(companyName);
  }

  // ========== EXISTING ENDPOINTS (unchanged) ==========

  @Post()
  @ApiOperation({
    summary: 'Create a new forum',
    description: 'Create a new forum. Admin users only.',
  })
  @ApiResponse({
    status: 201,
    description: 'Forum created successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Forum with this name already exists',
  })
  @ApiBody({ type: CreateForumDto })
  async createForum(@Body() createForumDto: CreateForumDto) {
    return this.forumService.createForum(createForumDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all forums',
    description: 'Get paginated list of forums with filtering and sorting.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['relevant', 'recent', 'popular', 'trending'],
  })
  @ApiQuery({
    name: 'timeFilter',
    required: false,
    enum: ['all', 'today', 'week', 'month'],
  })
  @ApiQuery({ name: 'companyName', required: false, type: String })
  @ApiQuery({ name: 'isGlobal', required: false, type: Boolean })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Forums retrieved successfully',
  })
  async getForums(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('timeFilter') timeFilter?: string,
    @Query('companyName') companyName?: string,
    @Query('isGlobal') isGlobal?: string, // Accept as string
    @Query('category') category?: string,
    @Query('page') page?: string, // Accept as string
    @Query('limit') limit?: string, // Accept as string
  ) {
    const filters: ForumFiltersDto = {
      search,
      sortBy: sortBy as any,
      timeFilter: timeFilter as any,
      companyName,
      isGlobal: isGlobal ? isGlobal === 'true' : undefined, // Convert string to boolean
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    return this.forumService.findAllForums(filters);
  }

  @Get('joined')
  @ApiOperation({
    summary: 'Get user joined forums',
    description: 'Get all forums that the current user has joined.',
  })
  @ApiQuery({ name: 'companyName', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Joined forums retrieved successfully',
  })
  async getJoinedForums(
    @CurrentUser() user: any,
    @Query('companyName') companyName?: string,
  ) {
    return this.forumService.getUserJoinedForums(user.userId, companyName);
  }

  // ========== TOPIC ENDPOINTS (MOVE BEFORE :id ROUTES) ==========

  @Post('topics')
  @ApiOperation({
    summary: 'Create a new topic',
    description:
      'Create a new discussion topic in a forum. User must be a member of the forum.',
  })
  @ApiResponse({
    status: 201,
    description: 'Topic created successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'User must join the forum before creating topics',
  })
  @ApiBody({ type: CreateTopicDto })
  async createTopic(
    @Body() createTopicDto: CreateTopicDto,
    @CurrentUser() user: any,
  ) {
    return this.topicService.createTopic(createTopicDto, user.userId);
  }

  @Get('topics')
  @ApiOperation({
    summary: 'Get all topics',
    description: 'Get paginated list of topics with filtering and sorting.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['relevant', 'recent', 'popular', 'trending'],
  })
  @ApiQuery({
    name: 'timeFilter',
    required: false,
    enum: ['all', 'today', 'week', 'month'],
  })
  @ApiQuery({ name: 'companyName', required: false, type: String })
  @ApiQuery({ name: 'forumId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Topics retrieved successfully',
  })
  async getTopics(@Query() filters: ForumFiltersDto, @CurrentUser() user: any) {
    return this.topicService.findAllTopics(filters, user.userId);
  }

  // ========== FORUM PARAMETERIZED ROUTES (AFTER SPECIFIC ROUTES) ==========

  @Get(':id')
  @ApiOperation({
    summary: 'Get forum by ID',
    description:
      'Get detailed information about a specific forum including recent topics.',
  })
  @ApiParam({ name: 'id', description: 'Forum ID' })
  @ApiResponse({
    status: 200,
    description: 'Forum retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Forum not found',
  })
  async getForum(@Param('id') id: string) {
    return this.forumService.findForumById(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update forum',
    description: 'Update forum information. Admin users only.',
  })
  @ApiParam({ name: 'id', description: 'Forum ID' })
  @ApiResponse({
    status: 200,
    description: 'Forum updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Forum not found',
  })
  @ApiBody({ type: UpdateForumDto })
  async updateForum(
    @Param('id') id: string,
    @Body() updateForumDto: UpdateForumDto,
  ) {
    return this.forumService.updateForum(id, updateForumDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete forum',
    description: 'Delete a forum. Admin users only.',
  })
  @ApiParam({ name: 'id', description: 'Forum ID' })
  @ApiResponse({
    status: 200,
    description: 'Forum deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Forum not found',
  })
  async deleteForum(@Param('id') id: string) {
    return this.forumService.deleteForum(id);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Join forum',
    description: 'Join a forum to participate in discussions.',
  })
  @ApiParam({ name: 'id', description: 'Forum ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined forum',
  })
  @ApiResponse({
    status: 409,
    description: 'User is already a member',
  })
  async joinForum(@Param('id') id: string, @CurrentUser() user: any) {
    return this.forumService.joinForum(id, user.userId);
  }

  @Post(':id/leave')
  @ApiOperation({
    summary: 'Leave forum',
    description: 'Leave a forum and stop receiving notifications.',
  })
  @ApiParam({ name: 'id', description: 'Forum ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully left forum',
  })
  @ApiResponse({
    status: 409,
    description: 'User is not a member',
  })
  async leaveForum(@Param('id') id: string, @CurrentUser() user: any) {
    return this.forumService.leaveForum(id, user.userId);
  }

  // ========== TOPIC CONTENT FILTER ROUTES (BEFORE :id) ==========

  @Get('topics/my-posts')
  @ApiOperation({ summary: 'Get topics created by the current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyTopics(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.topicService.getMyTopics(user.userId, page || 1, limit || 20);
  }

  @Get('topics/bookmarked')
  @ApiOperation({ summary: 'Get topics bookmarked by the current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getBookmarkedTopics(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.topicService.getBookmarkedTopics(
      user.userId,
      page || 1,
      limit || 20,
    );
  }

  // ========== TOPIC PARAMETERIZED ROUTES ==========

  @Get('topics/:id')
  @ApiOperation({
    summary: 'Get topic by ID',
    description:
      'Get detailed information about a specific topic including comments.',
  })
  @ApiParam({ name: 'id', description: 'Topic ID' })
  @ApiResponse({
    status: 200,
    description: 'Topic retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Topic not found',
  })
  async getTopic(@Param('id') id: string, @CurrentUser() user: any) {
    return this.topicService.findTopicById(id, user.userId);
  }

  @Post('topics/reactions')
  @ApiOperation({
    summary: 'Add/remove topic reaction',
    description:
      'Add or remove a reaction (seen, validated, inspired, heard) from a topic.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reaction updated successfully',
  })
  @ApiBody({ type: TopicReactionDto })
  async addTopicReaction(
    @Body() reactionDto: TopicReactionDto,
    @CurrentUser() user: any,
  ) {
    return this.topicService.addReaction(
      reactionDto.topicId,
      user.userId,
      reactionDto.reactionType,
    );
  }

  @Post('topics/:topicId/bookmark')
  @ApiOperation({ summary: 'Toggle bookmark on a forum topic' })
  @ApiParam({ name: 'topicId', description: 'Topic ID' })
  async toggleTopicBookmark(
    @CurrentUser() user: any,
    @Param('topicId') topicId: string,
  ) {
    return this.topicService.toggleTopicBookmark(topicId, user.userId);
  }

  @Delete('topics/:id')
  @ApiOperation({
    summary: 'Delete topic',
    description: 'Delete a topic. Only the topic owner can delete it.',
  })
  @ApiParam({ name: 'id', description: 'Topic ID' })
  @ApiResponse({
    status: 200,
    description: 'Topic deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'You can only delete your own topics',
  })
  async deleteTopic(@Param('id') id: string, @CurrentUser() user: any) {
    return this.topicService.deleteTopic(id, user.userId);
  }

  @Put('topics/:id')
  @ApiOperation({
    summary: 'Edit topic',
    description: 'Edit a topic. Only the topic owner can edit it.',
  })
  @ApiParam({ name: 'id', description: 'Topic ID' })
  @ApiBody({
    schema: {
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        isAnonymous: { type: 'boolean' },
      },
    },
  })
  async updateTopic(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    dto: {
      title?: string;
      content?: string;
      tags?: string[];
      isAnonymous?: boolean;
    },
  ) {
    return this.topicService.updateTopic(id, user.userId, dto);
  }

  // ========== COMMENT ENDPOINTS ==========

  @Post('comments')
  @ApiOperation({
    summary: 'Create a new comment',
    description:
      'Create a new comment on a topic. Can be a reply to another comment.',
  })
  @ApiResponse({
    status: 201,
    description: 'Comment created successfully',
  })
  @ApiBody({ type: CreateCommentDto })
  async createComment(
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.commentService.createComment(createCommentDto, user.userId);
  }

  @Get('topics/:topicId/comments')
  @ApiOperation({
    summary: 'Get topic comments',
    description: 'Get all comments for a specific topic.',
  })
  @ApiParam({ name: 'topicId', description: 'Topic ID' })
  @ApiResponse({
    status: 200,
    description: 'Comments retrieved successfully',
  })
  async getTopicComments(
    @Param('topicId') topicId: string,
    @CurrentUser() user: any,
  ) {
    return this.commentService.getTopicComments(topicId, user.userId);
  }

  @Post('comments/reactions')
  @ApiOperation({
    summary: 'Add comment reaction',
    description: 'Add a reaction (helpful, supportive) to a comment.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reaction added successfully',
  })
  @ApiBody({ type: CommentReactionDto })
  async addCommentReaction(
    @Body() reactionDto: CommentReactionDto,
    @CurrentUser() user: any,
  ) {
    return this.commentService.addCommentReaction(
      reactionDto.commentId,
      user.userId,
      reactionDto.reactionType,
    );
  }

  @Delete('comments/:id')
  @ApiOperation({
    summary: 'Delete comment',
    description: 'Delete a comment. Only the comment owner can delete it.',
  })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({
    status: 200,
    description: 'Comment deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'You can only delete your own comments',
  })
  async deleteComment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.commentService.deleteComment(id, user.userId);
  }

  @Put('comments/:id')
  @ApiOperation({
    summary: 'Edit comment',
    description: 'Edit a comment. Only the comment owner can edit it.',
  })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiBody({
    schema: {
      properties: {
        content: { type: 'string' },
      },
      required: ['content'],
    },
  })
  async updateComment(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('content') content: string,
  ) {
    return this.commentService.updateComment(id, user.userId, content);
  }

  // ========== OTHER ENDPOINTS ==========

  @Public()
  @Post('bootstrap/:companyName')
  @ApiOperation({
    summary: 'Bootstrap foundation forums',
    description:
      'Create foundation forums for a company. Public endpoint for setup.',
  })
  @ApiParam({ name: 'companyName', description: 'Company Name' })
  @ApiResponse({
    status: 200,
    description: 'Foundation forums bootstrapped successfully',
  })
  async bootstrapFoundationForums(@Param('companyName') companyName: string) {
    return this.forumService.bootstrapFoundationForums(companyName);
  }

  @Get('health')
  @Public()
  @ApiOperation({
    summary: 'Forum service health check',
    description: 'Check if forum service is running and healthy.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  async health() {
    return {
      status: 'ok',
      service: 'forum',
      timestamp: new Date().toISOString(),
    };
  }
}
