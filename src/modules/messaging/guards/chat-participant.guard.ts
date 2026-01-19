import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { supabaseAdmin } from '../../../database/supabase.client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatParticipantGuard implements CanActivate {
  private admin;

  constructor(private configService: ConfigService) {
    this.admin = supabaseAdmin(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const conversationId = request.params.id || request.body.conversation_id;

    if (!conversationId) {
      throw new ForbiddenException('Conversation ID is required');
    }

    try {
      const { data: conversation, error } = await this.admin
        .from('conversations')
        .select('user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (error || !conversation) {
        throw new ForbiddenException('Conversation not found');
      }

      if (
        conversation.user1_id !== user.userId &&
        conversation.user2_id !== user.userId
      ) {
        throw new ForbiddenException(
          'You are not a participant in this conversation',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException('Failed to verify conversation access');
    }
  }
}
