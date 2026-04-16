import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { supabaseAdmin } from '../../../database/supabase.client';
import { ConfigService } from '@nestjs/config';
import logger from '../../../common/utils/logger.util';
import { MSG } from '../../../common/constants/messages';

@Injectable()
export class ChatParticipantGuard implements CanActivate {
  private admin;

  constructor(private configService: ConfigService) {
    this.admin = supabaseAdmin(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Try different possible property names for user ID
    const userId = user?.id || user?.userId || user?.sub || user?.user_id;

    if (!userId) {
      logger.warn('No user ID found in request', {
        module: 'ChatParticipantGuard',
      });
      throw new ForbiddenException(MSG.MESSAGING.NOT_AUTHORIZED);
    }

    // Get conversation ID from different possible locations
    const conversationId =
      request.params?.id ||
      request.params?.conversationId ||
      request.params?.conversation_id ||
      request.body?.conversation_id ||
      request.query?.conversation_id;

    if (!conversationId) {
      throw new ForbiddenException(MSG.MESSAGING.CONV_NOT_FOUND);
    }

    try {
      const { data: conversation, error } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (error || !conversation) {
        throw new ForbiddenException(MSG.MESSAGING.CONV_NOT_FOUND);
      }

      // Convert both to strings for comparison
      const user1Id = String(conversation.user1_id);
      const user2Id = String(conversation.user2_id);
      const currentUserId = String(userId);

      if (user1Id !== currentUserId && user2Id !== currentUserId) {
        throw new ForbiddenException(
          'You are not a participant in this conversation',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      logger.error(MSG.MESSAGING.NOT_AUTHORIZED, {
        module: 'ChatParticipantGuard',
        error,
      });
      throw new ForbiddenException(MSG.MESSAGING.NOT_AUTHORIZED);
    }
  }
}
