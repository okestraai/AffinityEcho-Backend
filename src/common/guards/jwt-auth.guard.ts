import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { supabaseClient } from '../../database/supabase.client';
import { ConfigService } from '@nestjs/config';
import logger from '../utils/logger.util';

@Injectable()
export class JwtAuthGuard {
  private supabase;

  constructor(private config: ConfigService) {
    this.supabase = supabaseClient(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error) {
        logger.warn('Token validation failed', {
          message: error.message,
          status: error.status,
          tokenPrefix: token?.substring(0, 20) + '...',
          tokenLength: token?.length,
        });
        throw new UnauthorizedException(
          `Token validation failed: ${error.message}`,
        );
      }

      if (!data.user) {
        throw new UnauthorizedException('User not found');
      }

      // Set user in request - CRITICAL for CurrentUser to work
      request.user = {
        sub: data.user.id, // This MUST be set for @CurrentUser() to work
        email: data.user.email,
        user_metadata: data.user.user_metadata,
      };

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
