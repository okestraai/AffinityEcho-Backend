import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class MentorActiveGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Check if user has an active mentor profile
    const { data: profile } = await this.admin
      .from('user_profiles')
      .select('is_willing_to_mentor')
      .eq('id', user.userId)
      .single();

    if (!profile || !profile.is_willing_to_mentor) {
      throw new ForbiddenException('You need to have an active mentor profile');
    }

    return true;
  }
}
