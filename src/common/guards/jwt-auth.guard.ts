import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { supabaseClient } from '../../database/supabase.client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard {
  private supabase;

  constructor(private config: ConfigService) {
    this.supabase = supabaseClient(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    console.log('🔐 JwtAuthGuard: Starting authentication');
    console.log('🔐 Request URL:', request.url);
    console.log('🔐 Request method:', request.method);
    console.log('🔐 Token present:', !!token);

    if (!token) {
      console.log('❌ JwtAuthGuard: No token provided');
      throw new UnauthorizedException('No token provided');
    }

    console.log('🔐 Token preview:', token.substring(0, 20) + '...');
    console.log('🔐 Token length:', token.length);

    try {
      console.log('🔐 Validating token with Supabase...');
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error) {
        console.log('❌ Supabase validation error:', {
          message: error.message,
          name: error.name,
          status: error.status,
        });
        throw new UnauthorizedException(
          `Token validation failed: ${error.message}`,
        );
      }

      if (!data.user) {
        console.log('❌ No user data returned from Supabase');
        throw new UnauthorizedException('User not found');
      }

      console.log('✅ Token validated successfully:', {
        userId: data.user.id,
        email: data.user.email,
        emailConfirmed: !!data.user.email_confirmed_at,
      });

      // Set user in request - CRITICAL for CurrentUser to work
      request.user = {
        sub: data.user.id, // This MUST be set for @CurrentUser() to work
        email: data.user.email,
        user_metadata: data.user.user_metadata,
      };

      console.log('✅ Request user set:', request.user);

      return true;
    } catch (error: any) {
      console.log('❌ JwtAuthGuard error:', error.message);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      console.log('📝 No Authorization header found');
      console.log('📝 Available headers:', Object.keys(request.headers));
      return null;
    }

    console.log('📝 Authorization header:', authHeader);

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      console.log('❌ Invalid token type:', type);
      return null;
    }

    if (!token) {
      console.log('❌ No token after Bearer');
      return null;
    }

    return token;
  }
}
