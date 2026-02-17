// jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supabaseAdmin } from '../../../database/supabase.client';
import logger from '../../../common/utils/logger.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private admin;

  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
    
    this.admin = supabaseAdmin(configService);
  }

  async validate(payload: any) {
    logger.info('JWT Strategy - Validating payload', {
      sub: payload.sub,
    });

    try {
      // Query with the new email column
      const { data: user, error } = await this.admin
        .from('user_profiles')
        .select('id, username, email, privacy_level, has_completed_onboarding')
        .eq('id', payload.sub)
        .single();

      if (error) {
        logger.warn('Database query error in JWT strategy', {
          userId: payload.sub,
          error: error.message,
          code: error.code
        });

        // If user profile doesn't exist, create it automatically
        if (error.code === 'PGRST116') {
          logger.info('Creating user profile automatically in JWT strategy', {
            userId: payload.sub,
          });
          
          const createdUser = await this.createUserProfile(payload.sub, payload.email);
          
          if (createdUser) {
            return {
              userId: createdUser.id,
              email: createdUser.email,
              username: createdUser.username,
              privacyLevel: createdUser.privacy_level,
              hasCompletedOnboarding: createdUser.has_completed_onboarding,
              ...payload,
            };
          }
        }
        
        // For other errors, fall back to JWT payload but log the error
        logger.error('Database error during user verification, but proceeding with JWT payload', {
          userId: payload.sub,
          error: error.message
        });
        
        return {
          userId: payload.sub,
          email: payload.email,
          username: payload.username || `User${payload.sub.slice(0, 8)}`,
          privacyLevel: payload.privacyLevel || 'anonymous',
          hasCompletedOnboarding: payload.hasCompletedOnboarding || false,
          ...payload,
        };
      }

      if (!user) {
        logger.warn('User not found in database, creating profile', { userId: payload.sub });
        const createdUser = await this.createUserProfile(payload.sub, payload.email);
        
        if (createdUser) {
          return {
            userId: createdUser.id,
            email: createdUser.email,
            username: createdUser.username,
            privacyLevel: createdUser.privacy_level,
            hasCompletedOnboarding: createdUser.has_completed_onboarding,
            ...payload,
          };
        }
        
        throw new UnauthorizedException('User not found and could not create profile');
      }

      logger.info('JWT validation successful', {
        userId: user.id,
        username: user.username,
      });

      return {
        userId: user.id,
        email: user.email,
        username: user.username,
        privacyLevel: user.privacy_level,
        hasCompletedOnboarding: user.has_completed_onboarding,
        ...payload,
      };
    } catch (error: any) {
      logger.error('❌ JWT validation failed', {
        userId: payload.sub,
        error: error.message
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      // Even if there's an error, return the basic JWT payload to avoid breaking the app
      return {
        userId: payload.sub,
        email: payload.email,
        username: payload.username || `User${payload.sub.slice(0, 8)}`,
        privacyLevel: payload.privacyLevel || 'anonymous',
        hasCompletedOnboarding: payload.hasCompletedOnboarding || false,
        ...payload,
      };
    }
  }

  private async createUserProfile(userId: string, email: string): Promise<any> {
    try {
      const username = this.generateUsername();
      const profileData = {
        id: userId,
        username,
        email,
        avatar: 'User',
        privacy_level: 'anonymous',
        has_completed_onboarding: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      const { data, error } = await this.admin
        .from('user_profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create user profile in JWT strategy', {
          userId,
          error: error.message,
        });
        return null;
      }

      logger.info('User profile created automatically in JWT strategy', {
        userId,
        username,
      });

      return data;
    } catch (error) {
      logger.error('Unexpected error creating user profile in JWT strategy', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private generateUsername(): string {
    const adj = ['Brave', 'Quiet', 'Rising', 'Future', 'Bold', 'Smart', 'True', 'Next'];
    const noun = ['Leader', 'Voice', 'Pro', 'Dev', 'Builder', 'King', 'Queen', 'Star'];
    const num = Math.floor(Math.random() * 9999);
    return `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}${num}`;
  }
}