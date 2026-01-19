import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';

@Injectable()
export class NookActiveGuard implements CanActivate {
  private admin;

  constructor(private config: ConfigService) {
    this.admin = supabaseAdmin(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const nookId = request.params.id || request.params.nookId;

    if (!nookId) {
      return true; // Let other guards handle missing ID
    }

    const { data: nook, error } = await this.admin
      .from('nooks')
      .select('*')
      .eq('id', nookId)
      .single();

    if (error) {
      throw new BadRequestException('Nook not found');
    }

    if (!nook.is_active) {
      throw new BadRequestException('Nook is not active');
    }

    if (nook.is_locked) {
      throw new BadRequestException('Nook is locked');
    }

    if (new Date(nook.expires_at) < new Date()) {
      throw new BadRequestException('Nook has expired');
    }

    return true;
  }
}
