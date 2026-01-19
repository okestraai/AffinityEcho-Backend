import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Param,
  Put,
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
import { MessagingService } from '../services/messaging.service';
import {
  SendMessageDto,
  MarkAsReadDto,
  GetMessagesDto,
  ChatType,
} from '../dto/messaging.dto';

@ApiTags('Messaging')
@Controller('messaging')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('send')
  @ApiOperation({
    summary: 'Send a message',
    description: 'Send a message in a conversation',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    schema: {
      example: {
        success: true,
        data: {
          message_id: 'uuid',
          conversation_id: 'uuid',
          sent_at: '2024-01-01T12:00:00Z',
          recipient_id: 'uuid',
          sender_info: {
            username: 'user123',
            avatar: '👤',
          },
          chat_type: 'regular',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async sendMessage(@CurrentUser() user: any, @Body() dto: SendMessageDto) {
    return this.messagingService.sendMessage(user.userId, dto);
  }

  @Put('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark message as read',
    description: 'Mark a message as read',
  })
  @ApiBody({ type: MarkAsReadDto })
  @ApiResponse({
    status: 200,
    description: 'Message marked as read',
    schema: {
      example: {
        success: true,
        data: {
          message_id: 'uuid',
          read_at: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async markAsRead(@CurrentUser() user: any, @Body() dto: MarkAsReadDto) {
    return this.messagingService.markAsRead(
      user.userId,
      dto.message_id,
      dto.conversation_id,
    );
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread message count',
    description: 'Get total unread messages count',
  })
  @ApiQuery({
    name: 'chat_type',
    enum: ChatType,
    required: false,
    description: 'Filter by chat type',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved',
    schema: {
      example: {
        success: true,
        data: {
          unread_count: 5,
          chat_type: 'regular',
        },
      },
    },
  })
  async getUnreadCount(
    @CurrentUser() user: any,
    @Query('chat_type') chatType?: ChatType,
  ) {
    return this.messagingService.getUnreadCount(user.userId, chatType);
  }

  @Get('typing/:conversationId')
  @ApiOperation({
    summary: 'Get typing status',
    description: 'Get typing status for a conversation',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID',
  })
  @UseGuards(ChatParticipantGuard)
  @ApiResponse({
    status: 200,
    description: 'Typing status retrieved',
    schema: {
      example: {
        success: true,
        data: {
          is_typing: true,
          user_id: 'uuid',
          last_typing_at: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  async getTypingStatus(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    // This would typically be handled via WebSocket
    // This endpoint is for initial state or fallback
    return {
      success: true,
      data: {
        is_typing: false,
        user_id: null,
        last_typing_at: null,
      },
    };
  }
}
