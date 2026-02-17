import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FollowService } from '../services/follow.service';

/**
 * Proxy controller that maps frontend-expected paths under /users/:id/...
 * to the FollowService. The primary controller is FollowController at /mentorship/follow.
 */
@ApiTags('Users - Follow')
@Controller('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class UserFollowController {
  constructor(private readonly followService: FollowService) {}

  @Post(':userId/follow')
  async followUser(
    @CurrentUser() user: any,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.followService.followUser(user.userId, userId);
  }

  @Delete(':userId/follow')
  @HttpCode(HttpStatus.OK)
  async unfollowUser(
    @CurrentUser() user: any,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.followService.unfollowUser(user.userId, userId);
  }

  @Get(':userId/following/status')
  async checkFollowStatus(
    @CurrentUser() user: any,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.followService.checkFollowStatus(user.userId, userId);
  }
}
