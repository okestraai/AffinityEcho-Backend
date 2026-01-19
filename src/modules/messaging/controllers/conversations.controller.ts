import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChatParticipantGuard } from '../guards/chat-participant.guard';
import { ConversationsService } from '../services/conversations.service';
import {
  CreateConversationDto,
  GetConversationsDto,
  ClearConversationDto,
} from '../dto/conversations.dto';

@ApiTags('Conversations')
@Controller('conversations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a conversation',
    description: 'Create a new conversation with another user',
  })
  @ApiBody({ type: CreateConversationDto })
  @ApiResponse({
    status: 201,
    description: 'Conversation created successfully',
    schema: {
      example: {
        success: true,
        data: {
          conversation_id: 'uuid',
          other_user: {
            id: 'uuid',
            username: 'user123',
            avatar: '👤',
          },
          chat_type: 'regular',
          created_at: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createConversation(
    @CurrentUser() user: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.createConversation(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get conversations list',
    description: 'Get list of conversations with filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          conversations: [
            {
              id: 'uuid',
              other_user: {
                id: 'uuid',
                username: 'user123',
                avatar: '👤',
                job_title: 'Software Engineer',
                company: 'Tech Corp',
                mentoring_as: 'mentor',
              },
              last_message: {
                content_preview: 'Hello there!',
                sender_id: 'uuid',
                sent_at: '2024-01-01T12:00:00Z',
                content_type: 'text',
              },
              unread_count: 3,
              chat_type: 'regular',
              mentorship_context: null,
              identity_revealed: false,
              updated_at: '2024-01-01T12:00:00Z',
              last_activity_at: '2024-01-01T12:00:00Z',
            },
          ],
          total: 15,
          page: 1,
          limit: 20,
          total_pages: 1,
        },
      },
    },
  })
  async getConversations(
    @CurrentUser() user: any,
    @Query() dto: GetConversationsDto,
  ) {
    return this.conversationsService.getConversations(user.userId, dto);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Get conversation messages',
    description: 'Get messages from a specific conversation',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of messages to fetch (default: 50)',
  })
  @ApiQuery({
    name: 'before',
    required: false,
    type: String,
    description: 'Get messages before this message ID',
  })
  @UseGuards(ChatParticipantGuard)
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          conversation_id: 'uuid',
          messages: [
            {
              id: 'uuid',
              sender_id: 'uuid',
              content_encrypted: 'encrypted_content',
              content_type: 'text',
              is_read: true,
              read_at: '2024-01-01T12:00:00Z',
              sent_at: '2024-01-01T11:00:00Z',
              sender_info: {
                username: 'user123',
                avatar: '👤',
              },
            },
          ],
          has_more: true,
          total_count: 150,
        },
      },
    },
  })
  async getMessages(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: string,
  ) {
    return this.conversationsService.getConversationMessages(
      user.userId,
      conversationId,
      limit || 50,
      before,
    );
  }

  @Delete(':id/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear conversation',
    description: 'Clear conversation history (soft delete for user)',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
  })
  @UseGuards(ChatParticipantGuard)
  @ApiResponse({
    status: 200,
    description: 'Conversation cleared successfully',
    schema: {
      example: {
        success: true,
        data: {
          conversation_id: 'uuid',
          cleared_at: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  async clearConversation(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
  ) {
    const dto: ClearConversationDto = { conversation_id: conversationId };
    return this.conversationsService.clearConversation(user.userId, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get conversation statistics',
    description: 'Get statistics about conversations',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          total_conversations: 25,
          regular_chats: 18,
          mentorship_chats: 7,
          total_messages: 345,
          unread_messages: 12,
          active_chats: 8,
          identity_revealed_count: 5,
        },
      },
    },
  })
  async getStats(@CurrentUser() user: any) {
    // This would typically aggregate data from multiple services
    return {
      success: true,
      data: {
        total_conversations: 25,
        regular_chats: 18,
        mentorship_chats: 7,
        total_messages: 345,
        unread_messages: 12,
        active_chats: 8,
        identity_revealed_count: 5,
        last_7_days_activity: {
          messages_sent: 45,
          new_conversations: 3,
          identity_reveals: 2,
        },
      },
    };
  }
}
