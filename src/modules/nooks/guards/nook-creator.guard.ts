import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class NookCreatorGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const nookId = request.params.id;

    if (!userId || !nookId) {
      throw new ForbiddenException('Access denied');
    }

    // Check if user is the creator of the nook
    const { data: nook } = await this.admin
      .from('nooks')
      .select('creator_id')
      .eq('id', nookId)
      .eq('creator_id', userId)
      .maybeSingle();

    if (!nook) {
      // TODO: Add admin check here
      throw new ForbiddenException('Only creator or admin can perform this action');
    }

    return true;
  }
}