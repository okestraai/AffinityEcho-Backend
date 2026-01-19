import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class ReferralOwnerGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const referralId = request.params.id;

    if (!userId || !referralId) {
      throw new ForbiddenException('Invalid request');
    }

    const { data } = await this.admin
      .from('referral_posts')
      .select('user_id')
      .eq('id', referralId)
      .single();

    if (!data || data.user_id !== userId) {
      throw new ForbiddenException('Not authorized to modify this referral');
    }

    return true;
  }
}
