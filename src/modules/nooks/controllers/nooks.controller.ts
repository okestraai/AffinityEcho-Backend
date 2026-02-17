import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
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
import { NooksService } from '../services/nooks.service';
import { CreateNookDto } from '../dto/create-nook.dto';
import { NookQueryDto } from '../dto/nook-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NookActiveGuard } from '../guards/nook-active.guard';
import { NookCreatorGuard } from '../guards/nook-creator.guard';
import { LockNookDto } from '../dto/lock-nook.dto';

@ApiTags('Nooks')
@Controller('nooks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class NooksController {
  constructor(private readonly nooksService: NooksService) {}

  @Get()
  @ApiOperation({
    summary: 'List nooks with filtering and pagination',
    description:
      'Get paginated list of nooks with various filters and sorting options',
  })
  @ApiResponse({
    status: 200,
    description: 'Nooks retrieved successfully',
  })
  async findAll(@Query() query: NookQueryDto) {
    return this.nooksService.findAll(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new nook',
    description:
      'Create a new anonymous discussion nook that expires in 24 hours',
  })
  @ApiResponse({
    status: 201,
    description: 'Nook created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiBody({ type: CreateNookDto })
  async create(@CurrentUser() user: any, @Body() createNookDto: CreateNookDto) {
    return this.nooksService.create(createNookDto, user.userId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get global nook statistics',
    description:
      'Get statistics about nooks including active nooks, messages, etc.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats() {
    return this.nooksService.getGlobalStats();
  }

  @Get(':id')
  @UseGuards(NookActiveGuard)
  @ApiOperation({
    summary: 'Get single nook details',
    description: 'Get detailed information about a specific nook',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiResponse({
    status: 200,
    description: 'Nook retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Nook not found',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.nooksService.findOne(id, user.userId);
  }

  @Delete(':id')
  @UseGuards(NookCreatorGuard)
  @ApiOperation({
    summary: 'Delete a nook',
    description: 'Delete a nook (creator or admin only)',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiResponse({
    status: 200,
    description: 'Nook deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not creator or admin',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.nooksService.remove(id);
  }

  @Post(':id/lock')
  @ApiOperation({
    summary: 'Lock a nook',
    description: 'Lock a nook to prevent new messages (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiBody({ type: LockNookDto })
  @ApiResponse({
    status: 200,
    description: 'Nook locked successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin only',
  })
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() lockDto: LockNookDto,
    @CurrentUser() user: any,
  ) {
    // TODO: Add admin check
    const isAdmin = false; // Implement admin check
    if (!isAdmin) {
      throw new BadRequestException('Admin privileges required');
    }
    return this.nooksService.lock(id, lockDto.reason);
  }

  @Post(':id/flag')
  @UseGuards(NookActiveGuard)
  @ApiOperation({
    summary: 'Flag a message for moderation',
    description: 'Flag an inappropriate message in a nook',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiResponse({
    status: 200,
    description: 'Message flagged successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Message ID to flag' },
        reason: { type: 'string', description: 'Reason for flagging' },
      },
      required: ['messageId', 'reason'],
    },
  })
  async flagMessage(
    @Param('id', ParseUUIDPipe) nookId: string,
    @Body('messageId') messageId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.nooksService.flagMessage(
      nookId,
      messageId,
      reason,
      user.userId,
    );
  }
}
