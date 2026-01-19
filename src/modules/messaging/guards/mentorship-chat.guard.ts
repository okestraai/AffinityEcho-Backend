import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { supabaseAdmin } from '../../../database/supabase.client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MentorshipChatGuard implements CanActivate {
  private admin;

  constructor(private configService: ConfigService) {
    this.admin = supabaseAdmin(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const conversationId = request.params.id || request.body.conversation_id;

    try {
      // Get conversation details
      const { data: conversation, error } = await this.admin
        .from('conversations')
        .select('context_type, context_id, user1_id, user2_id')
        .eq('id', conversationId)
        .single();

      if (error || !conversation) {
        throw new BadRequestException('Conversation not found');
      }

      // Check if it's a mentorship chat
      if (conversation.context_type !== 'mentorship') {
        throw new ForbiddenException(
          'This action is only available for mentorship chats',
        );
      }

      // Check if user is part of mentorship relationship
      if (conversation.context_id) {
        const { data: relationship } = await this.admin
          .from('mentorship_relationships')
          .select('mentor_id, mentee_id, status')
          .eq('id', conversation.context_id)
          .single();

        if (
          relationship &&
          (relationship.mentor_id === user.userId ||
            relationship.mentee_id === user.userId)
        ) {
          if (
            relationship.status === 'active' ||
            relationship.status === 'pending'
          ) {
            return true;
          }
          throw new ForbiddenException('Mentorship relationship is not active');
        }
      }

      throw new ForbiddenException(
        'You are not part of this mentorship relationship',
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new ForbiddenException('Failed to verify mentorship chat access');
    }
  }
}
