import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import logger from '../utils/logger.util';
import { MSG } from '../constants/messages';

@Injectable()
export class JwtAuthGuard {
  private jwtService: JwtService;
  private jwtSecret: string;

  constructor(private config: ConfigService) {
    this.jwtSecret = config.get<string>('JWT_SECRET') || '';
    this.jwtService = new JwtService({ secret: this.jwtSecret });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(MSG.AUTH.NO_TOKEN);
    }

    try {
      const payload = this.jwtService.verify(token, { secret: this.jwtSecret });

      if (!payload.sub) {
        throw new UnauthorizedException(MSG.AUTH.INVALID_TOKEN);
      }

      // Set user in request — CRITICAL for @CurrentUser() to work
      request.user = {
        sub: payload.sub,
        email: payload.email,
      };

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException(MSG.AUTH.TOKEN_EXPIRED);
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException(MSG.AUTH.INVALID_TOKEN);
      }
      throw new UnauthorizedException(MSG.AUTH.AUTH_FAILED);
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return null;
    return token;
  }
}
