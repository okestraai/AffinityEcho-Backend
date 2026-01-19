import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class NookMemberGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException('Access denied');
    }

    let nookId: string;

    if (
      request.params.id &&
      request.route.path.includes('nooks/messages/:id')
    ) {
      // This is a message reaction route: /nooks/messages/:id/reactions
      // We need to fetch the nook_id from the message
      const fetchedNookId = await this.getNookIdFromMessage(request.params.id);
      if (!fetchedNookId) {
        throw new ForbiddenException('Message not found or invalid');
      }
      nookId = fetchedNookId;
    } else {
      // This is a nook route: /nooks/:id/...
      nookId = request.params.id || request.params.nookId;
    }

    if (!nookId) {
      throw new ForbiddenException('Unable to determine nook context');
    }

    // First, check if user is the creator of the nook
    const { data: nook } = await this.admin
      .from('nooks')
      .select('creator_id')
      .eq('id', nookId)
      .single();

    if (nook?.creator_id === userId) {
      return true; // Creator is always allowed
    }

    // If not creator, check if user is a member of the nook
    const { data: membership } = await this.admin
      .from('nook_members')
      .select('id')
      .eq('nook_id', nookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      throw new ForbiddenException('You must be a member of this nook');
    }

    return true;
  }

  private async getNookIdFromMessage(
    messageId: string,
  ): Promise<string | null> {
    const { data: message } = await this.admin
      .from('nook_messages')
      .select('nook_id')
      .eq('id', messageId)
      .single();

    return message?.nook_id || null;
  }
}
