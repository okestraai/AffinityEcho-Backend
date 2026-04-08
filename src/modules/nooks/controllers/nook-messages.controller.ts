import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { NookMessagesService } from '../services/nook-messages.service';
import { CreateMessageDto } from '../dto/create-message.dto';
import { MessageQueryDto } from '../dto/message-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NookActiveGuard } from '../guards/nook-active.guard';

@ApiTags('Nook Messages')
@Controller('nooks/:nookId/messages')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class NookMessagesController {
  constructor(private readonly messagesService: NookMessagesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get messages for a nook',
    description: 'Get paginated messages for a specific nook',
  })
  @ApiParam({ name: 'nookId', description: 'Nook ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
  })
  async getMessages(
    @Param('nookId', ParseUUIDPipe) nookId: string,
    @Query() query: MessageQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.messagesService.getMessages(nookId, query, user.userId);
  }

  @Post()
  @UseGuards(NookActiveGuard)
  @ApiOperation({
    summary: 'Post a message to a nook',
    description: 'Create a new message in a nook (replies allowed)',
  })
  @ApiParam({ name: 'nookId', description: 'Nook ID' })
  @ApiBody({ type: CreateMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Message posted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or nook is locked',
  })
  async createMessage(
    @Param('nookId', ParseUUIDPipe) nookId: string,
    @Body() createMessageDto: CreateMessageDto,
    @CurrentUser() user: any,
  ) {
    return this.messagesService.createMessage(
      nookId,
      createMessageDto,
      user.userId,
    );
  }

  @Put(':messageId')
  @ApiOperation({
    summary: 'Edit a message',
    description:
      'Edit message content (author only, nook must still be active)',
  })
  @ApiParam({ name: 'nookId', description: 'Nook ID' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiBody({
    schema: {
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
  })
  async editMessage(
    @Param('nookId', ParseUUIDPipe) nookId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body('content') content: string,
    @CurrentUser() user: any,
  ) {
    return this.messagesService.editMessage(
      nookId,
      messageId,
      user.userId,
      content,
    );
  }

  @Delete(':messageId')
  @ApiOperation({
    summary: 'Delete a message',
    description: 'Delete a message (author or admin only)',
  })
  @ApiParam({ name: 'nookId', description: 'Nook ID' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({
    status: 200,
    description: 'Message deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not author or admin',
  })
  async deleteMessage(
    @Param('nookId', ParseUUIDPipe) nookId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.messagesService.deleteMessage(nookId, messageId, user.userId);
  }
}
