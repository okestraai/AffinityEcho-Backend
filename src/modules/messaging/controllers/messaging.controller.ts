// messaging.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Param,
  Put,
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
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChatParticipantGuard } from '../guards/chat-participant.guard';
import { MessagingService } from '../services/messaging.service';
import {
  SendMessageDto,
  MarkAsReadDto,
  GetMessagesDto,
  ChatType,
  TypingStatusDto,
  DeleteMessageDto,
  EditMessageDto,
} from '../dto/messaging.dto';

@ApiTags('Messaging')
@Controller('messaging')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute for messaging
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

  @Delete('messages/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a message',
    description: 'Soft delete a message for the current user only',
  })
  @ApiParam({
    name: 'messageId',
    description: 'Message ID to delete',
  })
  @ApiBody({ type: DeleteMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Message deleted successfully',
    schema: {
      example: {
        success: true,
        data: {
          message_id: 'uuid',
          conversation_id: 'uuid',
          deleted_at: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @CurrentUser() user: any,
    @Param('messageId') messageId: string,
    @Body() dto: DeleteMessageDto,
  ) {
    return this.messagingService.deleteMessage(
      user.userId,
      messageId,
      dto.conversation_id,
    );
  }

  @Put('messages/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a message',
    description: 'Edit a text message in a conversation (only own messages)',
  })
  @ApiParam({
    name: 'messageId',
    description: 'Message ID to edit',
  })
  @ApiBody({ type: EditMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Message edited successfully',
    schema: {
      example: {
        success: true,
        data: {
          message_id: 'uuid',
          conversation_id: 'uuid',
          content_encrypted: 'encrypted_content',
          is_edited: true,
          edited_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
          recipient_id: 'uuid',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async editMessage(
    @CurrentUser() user: any,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagingService.editMessage(user.userId, messageId, dto);
  }

  // NEW: Typing status endpoints
  @Post('typing')
  @SkipThrottle() // Skip rate limiting for typing status (high frequency)
  @UseGuards(ChatParticipantGuard)
  @ApiOperation({
    summary: 'Set typing status',
    description: 'Set user typing status in a conversation',
  })
  @ApiBody({ type: TypingStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Typing status updated',
    schema: {
      example: {
        success: true,
        data: {
          user_id: 'uuid',
          conversation_id: 'uuid',
          is_typing: true,
          recipient_id: 'uuid',
          timestamp: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async setTypingStatus(
    @CurrentUser() user: any,
    @Body() dto: TypingStatusDto,
  ) {
    return this.messagingService.setTypingStatus(
      user.userId,
      dto.conversation_id,
      dto.is_typing,
    );
  }

  @Get('typing/:conversationId')
  @ApiOperation({
    summary: 'Get typing status',
    description: 'Get current typing status for a conversation',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Typing status retrieved',
    schema: {
      example: {
        success: true,
        data: {
          conversation_id: 'uuid',
          active_typers: [
            {
              user_id: 'uuid',
              username: 'user123',
              avatar: '👤',
              is_typing: true,
            },
          ],
          timestamp: '2024-01-01T12:00:00Z',
        },
      },
    },
  })
  async getTypingStatus(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.getTypingStatus(user.userId, conversationId);
  }
}
