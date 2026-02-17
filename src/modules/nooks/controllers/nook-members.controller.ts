import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { NookMembersService } from '../services/nook-members.service';
import { JoinNookDto } from '../dto/join-nook.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NookActiveGuard } from '../guards/nook-active.guard';

@ApiTags('Nook Members')
@Controller('nooks/:id/members')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class NookMembersController {
  constructor(private readonly membersService: NookMembersService) {}

  @Post('join')
  @UseGuards(NookActiveGuard)
  @ApiOperation({
    summary: 'Join a nook',
    description: 'Join a nook as a member (anonymous by default)',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiBody({ type: JoinNookDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined the nook',
  })
  @ApiResponse({
    status: 400,
    description: 'Already a member or nook is full',
  })
  async join(
    @Param('id', ParseUUIDPipe) nookId: string,
    @Body() joinDto: JoinNookDto,
    @CurrentUser() user: any,
  ) {
    return this.membersService.join(nookId, user.userId, joinDto);
  }

  @Post('leave')
  @ApiOperation({
    summary: 'Leave a nook',
    description: 'Leave a nook you are currently a member of',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiResponse({
    status: 200,
    description: 'Successfully left the nook',
  })
  async leave(
    @Param('id', ParseUUIDPipe) nookId: string,
    @CurrentUser() user: any,
  ) {
    return this.membersService.leave(nookId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Get nook members',
    description: 'Get list of nook members (admin only)',
  })
  @ApiParam({ name: 'id', description: 'Nook ID' })
  @ApiResponse({
    status: 200,
    description: 'Members retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin only',
  })
  async getMembers(
    @Param('id', ParseUUIDPipe) nookId: string,
    @CurrentUser() user: any,
  ) {
    // TODO: Add admin check
    return this.membersService.getMembers(nookId);
  }
}
