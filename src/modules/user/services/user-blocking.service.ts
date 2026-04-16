import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';
import { BlockUserDto } from '../dto/update-profile.dto';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class UserBlockingService {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  // ============ BLOCK USER ============

  async blockUser(blockerId: string, blockedId: string, dto: BlockUserDto) {
    logger.info('Blocking user', { blockerId, blockedId });

    try {
      // Prevent self-blocking
      if (blockerId === blockedId) {
        throw new BadRequestException(MSG.USER.CANNOT_BLOCK_SELF);
      }

      // Verify blocked user exists
      const { data: blockedUser } = await this.admin
        .from('user_profiles')
        .select('id, username')
        .eq('id', blockedId)
        .single();

      if (!blockedUser) {
        throw new NotFoundException(MSG.USER.NOT_FOUND);
      }

      // Check if already blocked
      const { data: existing } = await this.admin
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
        .maybeSingle();

      if (existing) {
        throw new BadRequestException(MSG.USER.ALREADY_BLOCKED);
      }

      // Create block entry
      const { error } = await this.admin.from('user_blocks').insert({
        blocker_id: blockerId,
        blocked_id: blockedId,
        reason: dto.reason || null,
      });

      if (error) {
        throw new BadRequestException(MSG.USER.BLOCK_FAILED);
      }

      // Remove any existing follow relationships
      await this.admin
        .from('user_follows')
        .delete()
        .or(
          `and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`,
        );

      // Remove any pending connection requests
      await this.admin
        .from('referral_connections')
        .delete()
        .or(
          `and(requester_id.eq.${blockerId},receiver_id.eq.${blockedId}),and(requester_id.eq.${blockedId},receiver_id.eq.${blockerId})`,
        );

      logger.info('User blocked successfully', {
        blockerId,
        blockedId,
        blockedUsername: blockedUser.username,
      });

      return {
        success: true,
        message: `${blockedUser.username} has been blocked`,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error(MSG.USER.BLOCK_FAILED, { error });
      throw new BadRequestException(MSG.USER.BLOCK_FAILED);
    }
  }

  // ============ UNBLOCK USER ============

  async unblockUser(blockerId: string, blockedId: string) {
    logger.info('Unblocking user', { blockerId, blockedId });

    try {
      // Verify block exists
      const { data: block } = await this.admin
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
        .maybeSingle();

      if (!block) {
        throw new NotFoundException(MSG.USER.BLOCK_NOT_FOUND);
      }

      // Remove block
      const { error } = await this.admin
        .from('user_blocks')
        .delete()
        .eq('id', block.id);

      if (error) {
        throw new BadRequestException(MSG.USER.UNBLOCK_FAILED);
      }

      logger.info('User unblocked successfully', { blockerId, blockedId });

      return {
        success: true,
        message: MSG.USER.UNBLOCKED,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      logger.error(MSG.USER.UNBLOCK_FAILED, { error });
      throw new BadRequestException(MSG.USER.UNBLOCK_FAILED);
    }
  }

  // ============ GET BLOCKED USERS ============

  async getBlockedUsers(userId: string, page: number = 1, limit: number = 20) {
    logger.info('Fetching blocked users', { userId, page, limit });

    const offset = (page - 1) * limit;

    try {
      const {
        data: blocks,
        error,
        count,
      } = await this.admin
        .from('user_blocks')
        .select(
          `
          id,
          blocked_id,
          reason,
          created_at,
          blocked_user:blocked_id(
            id,
            username,
            avatar,
            bio
          )
        `,
          { count: 'exact' },
        )
        .eq('blocker_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException(MSG.USER.BLOCK_STATUS_FAILED);
      }

      const formattedBlocks = (blocks || []).map((block: any) => ({
        id: block.id,
        blockedAt: block.created_at,
        reason: block.reason,
        user: {
          id: block.blocked_user?.id,
          username: block.blocked_user?.username,
          avatar: block.blocked_user?.avatar,
          bio: block.blocked_user?.bio,
        },
      }));

      return {
        success: true,
        data: formattedBlocks,
        pagination: {
          page,
          limit,
          total: count || 0,
          hasMore: (count || 0) > offset + limit,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      logger.error(MSG.USER.BLOCK_STATUS_FAILED, { error });
      throw new BadRequestException(MSG.USER.BLOCK_STATUS_FAILED);
    }
  }

  // ============ CHECK BLOCK STATUS ============

  async isBlocked(userId: string, targetUserId: string): Promise<boolean> {
    try {
      const { data } = await this.admin
        .from('user_blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${userId})`,
        )
        .maybeSingle();

      return !!data;
    } catch (error) {
      logger.error('Failed to check block status', { error });
      return false;
    }
  }

  async getBlockStatus(userId: string, targetUserId: string) {
    logger.info('Checking block status', { userId, targetUserId });

    try {
      const isBlocked = await this.isBlocked(userId, targetUserId);

      return {
        success: true,
        data: {
          isBlocked,
        },
      };
    } catch (error) {
      logger.error(MSG.USER.BLOCK_STATUS_FAILED, { error });
      throw new BadRequestException(MSG.USER.BLOCK_STATUS_FAILED);
    }
  }
}
